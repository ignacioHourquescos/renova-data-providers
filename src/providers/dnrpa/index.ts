import { logger } from "../../lib/logger.js";
import { solveRecaptchaV2 } from "./captcha.js";
import { callEstimar, createSession, parseApiResponse } from "./client.js";
import type { DnrpaVehicle } from "./types.js";

const RETRY_DELAY_MS = () => 5000 + Math.random() * 3000;

/**
 * Busca vehículo por patente en DNRPA.
 * 1) CSRF token
 * 2) Resuelve captcha
 * 3) Intenta CodigoTramite NACIONAL (083000)
 * 4) Si falla, IMPORTADO (084000) con el mismo token/sesión
 * 5) Un reintento completo con token nuevo si todo falla
 */
export async function searchByPatente(
  patente: string,
  retryOnFailure = true,
): Promise<DnrpaVehicle> {
  const maxAttempts = retryOnFailure ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const delay = RETRY_DELAY_MS();
      logger.info({ attempt, delayMs: Math.round(delay) }, "Retry DNRPA search");
      await sleep(delay);
    }

    try {
      const session = await createSession();
      const token = await solveRecaptchaV2();

      let data = await callEstimar(patente, token, "083000", session);
      let vehicle = parseApiResponse(data);

      if (!vehicle) {
        logger.debug("Sin datos con 083000, probando 084000");
        data = await callEstimar(patente, token, "084000", session);
        vehicle = parseApiResponse(data);
      }

      if (vehicle) {
        logger.info(
          { patente, make: vehicle.make, model: vehicle.model },
          "DNRPA search OK",
        );
        return vehicle;
      }

      if (attempt === maxAttempts) {
        return {
          make: null,
          model: null,
          type: null,
          year: null,
          origin: null,
          error:
            "No se pudo obtener información del vehículo después de múltiples intentos",
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ attempt, patente, err: message }, "DNRPA search error");

      if (attempt === maxAttempts) {
        return {
          make: null,
          model: null,
          type: null,
          year: null,
          origin: null,
          error: message,
        };
      }
    }
  }

  return {
    make: null,
    model: null,
    type: null,
    year: null,
    origin: null,
    error: "No se pudo obtener información del vehículo",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
