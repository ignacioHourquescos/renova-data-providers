import { Router } from "express";
import { z } from "zod";
import { isValidPatente, normalizePatente } from "../lib/patente.js";
import { logger } from "../lib/logger.js";
import { searchByPatente } from "../providers/dnrpa/index.js";

export const dnrpaRouter = Router();

const bodySchema = z.object({
  patente: z.string().min(1),
});

/** Timeout del endpoint: 4 min (2captcha puede tardar ~3 min) */
const ENDPOINT_TIMEOUT_MS = 240_000;

dnrpaRouter.post("/search", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      make: null,
      model: null,
      type: null,
      year: null,
      origin: null,
      error: "Body inválido. Esperado: { patente: string }",
    });
  }

  const patente = normalizePatente(parsed.data.patente);
  if (!isValidPatente(patente)) {
    return res.status(400).json({
      make: null,
      model: null,
      type: null,
      year: null,
      origin: null,
      error: "Formato de patente inválido. Debe ser ABC123 o AB123CD",
    });
  }

  logger.info({ patente }, "DNRPA search requested");

  try {
    const result = await Promise.race([
      searchByPatente(patente, true),
      rejectAfter(ENDPOINT_TIMEOUT_MS, `Timeout: la búsqueda tardó más de ${ENDPOINT_TIMEOUT_MS / 1000} segundos`),
    ]);

    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ patente, err: message }, "DNRPA route error");
    return res.json({
      make: null,
      model: null,
      type: null,
      year: null,
      origin: null,
      error: message,
    });
  }
});

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}
