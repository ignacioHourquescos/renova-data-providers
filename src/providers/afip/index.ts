import { logger } from "../../lib/logger.js";
import { solveImageCaptcha } from "./captcha.js";
import {
  createSession,
  fetchCaptcha,
  fetchConstanciaHtml,
  submitConsulta,
} from "./client.js";
import { parseConstanciaHtml } from "./parse.js";
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
      const html = await fetchConstanciaHtml(jar, redirect);
      const parsed = parseConstanciaHtml(html, cuit);

      if (parsed.denominacion || /CONSTANCIA DE INSCRIPC/i.test(html)) {
        logger.info({ cuit, denominacion: parsed.denominacion }, "AFIP constancia OK");
        return parsed;
      }

      if (attempt === maxAttempts) {
        return parsed;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ attempt, cuit, err: message }, "AFIP constancia error");

      if (attempt === maxAttempts) {
        return {
          cuit,
          denominacion: null,
          tipoPersona: null,
          fechaContratoSocial: null,
          impuestos: [],
          actividades: [],
          domicilioFiscal: { texto: null },
          html: null,
          error: message,
        };
      }
    }
  }

  return {
    cuit,
    denominacion: null,
    tipoPersona: null,
    fechaContratoSocial: null,
    impuestos: [],
    actividades: [],
    domicilioFiscal: { texto: null },
    html: null,
    error: "No se pudo obtener la constancia",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
