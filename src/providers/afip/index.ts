import { logger } from "../../lib/logger.js";
import { solveImageCaptcha } from "./captcha.js";
import {
  createSession,
  fetchCaptcha,
  fetchConstanciaPages,
  submitConsulta,
} from "./client.js";
import { emptyConstancia, parseConstanciaHtml } from "./parse.js";
import type { AfipConstancia } from "./types.js";

const RETRY_DELAY_MS = () => 4000 + Math.random() * 2000;

export async function fetchConstanciaByCuit(
  cuit: string,
  retryOnFailure = true,
): Promise<AfipConstancia> {
  const maxAttempts = retryOnFailure ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const delay = RETRY_DELAY_MS();
      logger.info({ attempt, delayMs: Math.round(delay) }, "Retry AFIP constancia");
      await sleep(delay);
    }

    try {
      const jar = await createSession();
      const challenge = await fetchCaptcha(jar);
      const solution = await solveImageCaptcha(challenge.imageBase64);
      const redirect = await submitConsulta(jar, cuit, challenge.token, solution);
      const html = await fetchConstanciaPages(jar, redirect);
      const parsed = parseConstanciaHtml(html, cuit);

      if (
        parsed.denominacion ||
        parsed.condicionFiscal ||
        /CONSTANCIA DE INSCRIPC|CONSTANCIA DE OPCI/i.test(html)
      ) {
        logger.info(
          {
            cuit,
            denominacion: parsed.denominacion,
            condicionFiscal: parsed.condicionFiscal,
          },
          "AFIP constancia OK",
        );
        return parsed;
      }

      if (attempt === maxAttempts) {
        return parsed;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ attempt, cuit, err: message }, "AFIP constancia error");

      if (attempt === maxAttempts) {
        return emptyConstancia(cuit, null, message);
      }
    }
  }

  return emptyConstancia(cuit, null, "No se pudo obtener la constancia");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
