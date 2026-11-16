import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { searchWegaByCode } from "../providers/maxoil/index.js";

export const maxoilRouter = Router();

const bodySchema = z.object({
  code: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
});

const INVALID_BODY = "Body inválido. Esperado: { code: string } o { query: string }";

maxoilRouter.post("/wega/search", async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  const query = parsed.success
    ? (parsed.data.code ?? parsed.data.query)?.trim()
    : undefined;
  if (!query) {
    return res.status(400).json({ items: [], error: INVALID_BODY });
  }

  logger.info({ query }, "Maxoil WEGA search requested");

  try {
    return res.json(await searchWegaByCode(query));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query, err: message }, "Maxoil route error");
    return res.json({ items: [], error: message });
  }
});
