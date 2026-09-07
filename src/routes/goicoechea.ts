import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { searchByCode } from "../providers/goicoechea/index.js";

export const goicoecheaRouter = Router();

const bodySchema = z.object({
  code: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  quantity: z.coerce.number().int().positive().optional(),
  cantidad: z.coerce.number().int().positive().optional(),
});

const ENDPOINT_TIMEOUT_MS = 45_000;

goicoecheaRouter.post("/search", async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      items: [],
      error:
        "Body inválido. Esperado: { code: string, quantity?: number } o { query: string, quantity?: number }",
    });
  }

  const query = (parsed.data.code ?? parsed.data.query)?.trim();
  if (!query) {
    return res.status(400).json({
      items: [],
      error:
        "Body inválido. Esperado: { code: string, quantity?: number } o { query: string, quantity?: number }",
    });
  }

  const quantity = parsed.data.quantity ?? parsed.data.cantidad ?? 1;

  logger.info({ query, quantity }, "Goicoechea search requested");

  try {
    const result = await Promise.race([
      searchByCode(query, quantity),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Goicoechea timeout")),
          ENDPOINT_TIMEOUT_MS,
        );
      }),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query, quantity, err: message }, "Goicoechea route error");
    return res.json({ items: [], error: message });
  }
});
