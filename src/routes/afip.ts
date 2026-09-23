import { Router } from "express";
import { z } from "zod";
import { isValidCuit, normalizeCuit } from "../lib/cuit.js";
import { logger } from "../lib/logger.js";
import { emptyConstancia } from "../providers/afip/parse.js";
import { fetchConstanciaByCuit } from "../providers/afip/index.js";

export const afipRouter = Router();

const bodySchema = z.object({
  cuit: z.string().min(1),
});

const ENDPOINT_TIMEOUT_MS = 240_000;

afipRouter.post("/constancia", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(
      emptyConstancia("", null, "Body inválido. Esperado: { cuit: string }"),
    );
  }

  const cuit = normalizeCuit(parsed.data.cuit);
  if (!isValidCuit(cuit)) {
    return res.status(400).json(
      emptyConstancia(
        cuit,
        null,
        "CUIT inválido. Debe tener 11 dígitos y dígito verificador correcto",
      ),
    );
  }

  logger.info({ cuit }, "AFIP constancia requested");

  try {
    const result = await Promise.race([
      fetchConstanciaByCuit(cuit, true),
      rejectAfter(
        ENDPOINT_TIMEOUT_MS,
        `Timeout: la consulta tardó más de ${ENDPOINT_TIMEOUT_MS / 1000} segundos`,
      ),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ cuit, err: message }, "AFIP route error");
    return res.json(emptyConstancia(cuit, null, message));
  }
});

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}
