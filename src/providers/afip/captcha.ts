import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40;

/**
 * Resuelve captcha de imagen AFIP (6 caracteres) via 2captcha.
 */
export async function solveImageCaptcha(imageBase64: string): Promise<string> {
  const apiKey = env.RECAPTCHA_SOLVER_API_KEY;
  if (!apiKey) {
    throw new Error("RECAPTCHA_SOLVER_API_KEY no configurada");
  }

  const body = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");

  const inRes = await fetch("http://2captcha.com/in.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      key: apiKey,
      method: "base64",
      body,
      json: "1",
      min_len: "6",
      max_len: "6",
    }),
  });
  const inData = (await inRes.json()) as { status: number; request: string };

  if (inData.status !== 1) {
    logger.warn({ response: inData }, "2captcha in.php (image) falló");
    throw new Error(`2captcha in.php: ${inData.request}`);
  }

  const requestId = inData.request;
  logger.info({ requestId }, "Esperando solución de captcha AFIP");

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
      const solution = resData.request.trim();
      logger.info({ length: solution.length }, "2captcha devolvió captcha AFIP");
      return solution;
    }

    if (resData.request !== "CAPCHA_NOT_READY") {
      logger.warn({ response: resData }, "2captcha error (AFIP image)");
      throw new Error(`2captcha: ${resData.request}`);
    }
  }

  throw new Error("Timeout esperando solución de captcha AFIP");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
