import { Router } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import {
  getCatalogue,
  listMakes,
  listModels,
  resolveProducts,
} from "../providers/wega/index.js";
import {
  ingestPriceList,
  lookupPrice,
} from "../providers/wega/priceList.js";

export const wegaRouter = Router();

const ENDPOINT_TIMEOUT_MS = 45_000;

const modelsBodySchema = z.object({
  id: z.union([z.string().min(1), z.number()]).transform(String),
});

const catalogueBodySchema = z.object({
  make: z.union([z.string().min(1), z.number()]).transform(String),
  model: z.union([z.string().min(1), z.number()]).transform(String),
  tipoVehiculo: z
    .union([z.string().min(1), z.number()])
    .transform(String)
    .optional(),
});

const resolveBodySchema = z.object({
  codes: z.array(z.union([z.string(), z.number()]).transform(String)),
});

const RESOLVE_TIMEOUT_MS = 50_000;

wegaRouter.get("/makes", (_req, res) => {
  return res.json(listMakes());
});

wegaRouter.post("/models", async (req, res) => {
  const parsed = modelsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      models: [],
      error: "Body inválido. Esperado: { id: string }",
    });
  }

  const { id } = parsed.data;
  logger.info({ id }, "Wega models requested");

  try {
    const result = await Promise.race([
      listModels(id),
      rejectAfter(
        ENDPOINT_TIMEOUT_MS,
        `Timeout: la búsqueda tardó más de ${ENDPOINT_TIMEOUT_MS / 1000} segundos`,
      ),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ id, err: message }, "Wega models route error");
    return res.json({ models: [], error: message });
  }
});

wegaRouter.post("/catalogue", async (req, res) => {
  const parsed = catalogueBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      headers: [],
      rows: [],
      error: "Body inválido. Esperado: { make: string, model: string }",
    });
  }

  const { make, model, tipoVehiculo } = parsed.data;
  logger.info({ make, model, tipoVehiculo }, "Wega catalogue requested");

  try {
    const result = await Promise.race([
      getCatalogue(make, model, tipoVehiculo),
      rejectAfter(
        ENDPOINT_TIMEOUT_MS,
        `Timeout: la búsqueda tardó más de ${ENDPOINT_TIMEOUT_MS / 1000} segundos`,
      ),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ make, model, err: message }, "Wega catalogue route error");
    return res.json({ headers: [], rows: [], error: message });
  }
});

const priceBodySchema = z.object({
  code: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
});

const priceListBodySchema = z.object({
  fileUrl: z.string().trim().min(1).optional(),
  codeColumn: z.string().trim().min(1).optional(),
  priceColumn: z.string().trim().min(1).optional(),
  discountPercent: z.coerce.number(),
  monthKey: z.union([z.string(), z.number()]).transform(String).optional(),
});

const PRICE_LIST_TIMEOUT_MS = 55_000;

wegaRouter.post("/price-list", async (req, res) => {
  const parsed = priceListBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      rowCount: 0,
      monthKey: null,
      discountPercent: null,
      error:
        "Body inválido. Esperado: { fileUrl, codeColumn, priceColumn, discountPercent } o { discountPercent }",
    });
  }

  logger.info(
    {
      hasFile: Boolean(parsed.data.fileUrl),
      monthKey: parsed.data.monthKey,
      discountPercent: parsed.data.discountPercent,
    },
    "Wega price list ingest requested",
  );

  try {
    const result = await Promise.race([
      ingestPriceList(parsed.data),
      rejectAfter(
        PRICE_LIST_TIMEOUT_MS,
        `Timeout: la carga tardó más de ${PRICE_LIST_TIMEOUT_MS / 1000} segundos`,
      ),
    ]);
    const status = result.error ? 400 : 200;
    return res.status(status).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "Wega price list ingest error");
    return res.status(500).json({
      rowCount: 0,
      monthKey: null,
      discountPercent: parsed.data.discountPercent,
      error: message,
    });
  }
});

wegaRouter.post("/price", async (req, res) => {
  const parsed = priceBodySchema.safeParse(req.body);
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

  logger.info({ query }, "Wega price requested");

  try {
    const result = await lookupPrice(query);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query, err: message }, "Wega price route error");
    return res.json({ items: [], error: message });
  }
});

wegaRouter.post("/resolve", async (req, res) => {
  const parsed = resolveBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      items: {},
      error: "Body inválido. Esperado: { codes: string[] }",
    });
  }

  const { codes } = parsed.data;
  logger.info({ count: codes.length }, "Wega resolve requested");

  try {
    const result = await Promise.race([
      resolveProducts(codes),
      rejectAfter(
        RESOLVE_TIMEOUT_MS,
        `Timeout: la búsqueda tardó más de ${RESOLVE_TIMEOUT_MS / 1000} segundos`,
      ),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, count: codes.length }, "Wega resolve route error");
    return res.json({ items: {}, error: message });
  }
});

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}
