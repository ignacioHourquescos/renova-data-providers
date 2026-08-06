import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { searchByCode } from "../providers/lubaires/index.js";
import type { LubairesBrand } from "../providers/lubaires/types.js";

export const lubairesRouter = Router();

const bodySchema = z.object({
  code: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
});

async function handleBrandSearch(
  brand: LubairesBrand,
  req: Request,
  res: Response,
) {
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

  logger.info({ query, brand }, "Lubaires search requested");

  try {
    const result = await searchByCode(query, brand);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query, brand, err: message }, "Lubaires route error");
    return res.json({ items: [], error: message });
  }
}

lubairesRouter.post("/mann/search", (req, res) =>
  handleBrandSearch("MANN", req, res),
);

lubairesRouter.post("/wix/search", (req, res) =>
  handleBrandSearch("WIX", req, res),
);
