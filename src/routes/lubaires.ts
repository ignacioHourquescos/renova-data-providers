import { Router } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { searchByCode } from "../providers/lubaires/index.js";

export const lubairesRouter = Router();

const bodySchema = z.object({
  code: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
});

lubairesRouter.post("/search", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      items: [],
      error: "Body inválido. Esperado: { code: string } o { query: string }",
    });
  }

  const query = (parsed.data.code ?? parsed.data.query)?.trim();
  if (!query) {
    return res.status(400).json({
      items: [],
      error: "Body inválido. Esperado: { code: string } o { query: string }",
    });
  }

  logger.info({ query }, "Lubaires search requested");

  try {
    const result = await searchByCode(query);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query, err: message }, "Lubaires route error");
    return res.json({ items: [], error: message });
  }
});
