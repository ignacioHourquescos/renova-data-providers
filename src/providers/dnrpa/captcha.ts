import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const SITEKEY = "6Ld5ZjUUAAAAAJ7zlNNbYOQ9REJyT9LeFH13N-We";
const PAGE_URL = "https://www2.jus.gov.ar/dnrpa-site/#!/estimador";
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60; // ~3 minutes

/**
 * Resuelve reCAPTCHA v2 via 2captcha.
 * El token solo sirve una vez.
 */
export async function solveRecaptchaV2(): Promise<string> {
  const apiKey = env.RECAPTCHA_SOLVER_API_KEY;
  if (!apiKey) {
    throw new Error("RECAPTCHA_SOLVER_API_KEY no configurada");
  }

  const inUrl = new URL("http://2captcha.com/in.php");
  inUrl.searchParams.set("key", apiKey);
  inUrl.searchParams.set("method", "userrecaptcha");
  inUrl.searchParams.set("googlekey", SITEKEY);
  inUrl.searchParams.set("pageurl", PAGE_URL);
  inUrl.searchParams.set("json", "1");

  const inRes = await fetch(inUrl);
  const inData = (await inRes.json()) as { status: number; request: string };

  if (inData.status !== 1) {
    logger.warn({ response: inData }, "2captcha in.php falló");
    throw new Error(`2captcha in.php: ${inData.request}`);
  }

  const requestId = inData.request;
  logger.info({ requestId }, "Esperando solución de 2captcha");

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const resUrl = new URL("http://2captcha.com/res.php");
    resUrl.searchParams.set("key", apiKey);
    resUrl.searchParams.set("action", "get");
    resUrl.searchParams.set("id", requestId);
    resUrl.searchParams.set("json", "1");

    const res = await fetch(resUrl);
    const resData = (await res.json()) as { status: number; request: string };

    if (resData.status === 1) {
      logger.info("2captcha devolvió token");
      return resData.request;
    }

    if (resData.request !== "CAPCHA_NOT_READY") {
      logger.warn({ response: resData }, "2captcha error");
      throw new Error(`2captcha: ${resData.request}`);
    }
  }

  throw new Error("Timeout esperando solución de 2captcha");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
