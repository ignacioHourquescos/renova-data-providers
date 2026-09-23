import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { searchByCode } from "../providers/eagle/index.js";

export const eagleRouter = Router();

const bodySchema = z.object({
  code: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  quantity: z.coerce.number().int().positive().optional(),
  cantidad: z.coerce.number().int().positive().optional(),
});

const ENDPOINT_TIMEOUT_MS = 30_000;
const INVALID_BODY =
  "Body inválido. Esperado: { code: string, quantity?: number } o { query: string, quantity?: number }";

eagleRouter.post("/search", async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ items: [], updatedAt: null, error: INVALID_BODY });
  }

  const query = (parsed.data.code ?? parsed.data.query)?.trim();
  if (!query) {
    return res.status(400).json({ items: [], updatedAt: null, error: INVALID_BODY });
  }

  const quantity = parsed.data.quantity ?? parsed.data.cantidad ?? 1;
  logger.info({ query, quantity }, "Eagle search requested");

  try {
    const result = await Promise.race([
      searchByCode(query, quantity),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Eagle timeout")), ENDPOINT_TIMEOUT_MS);
      }),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query, quantity, err: message }, "Eagle route error");
    return res.json({ items: [], updatedAt: null, error: message });
  }
});
