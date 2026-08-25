import { Router } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import {
  getCatalogue,
  listMakes,
  listModels,
  listVersions,
  resolveProducts,
} from "../providers/fram/index.js";

export const framRouter = Router();

const ENDPOINT_TIMEOUT_MS = 60_000;

const idSchema = z.union([z.string().min(1), z.number()]).transform(String);

const modelsBodySchema = z.object({
  id: idSchema,
});

const versionsBodySchema = z.object({
  make: idSchema,
  model: idSchema,
});

const catalogueBodySchema = z.object({
  make: idSchema,
  model: idSchema,
  version: idSchema,
});

const resolveBodySchema = z.object({
  codes: z.array(z.union([z.string(), z.number()]).transform(String)),
});

framRouter.get("/makes", (_req, res) => {
  return res.json(listMakes());
});

framRouter.post("/models", async (req, res) => {
  const parsed = modelsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      models: [],
      error: "Body inválido. Esperado: { id: string }",
    });
  }

  const { id } = parsed.data;
  logger.info({ id }, "FRAM models requested");

  try {
    const result = await Promise.race([
      listModels(id),
      rejectAfter(ENDPOINT_TIMEOUT_MS, timeoutMessage()),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ id, err: message }, "FRAM models route error");
    return res.json({ models: [], error: message });
  }
});

framRouter.post("/versions", async (req, res) => {
  const parsed = versionsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      versions: [],
      error: "Body inválido. Esperado: { make: string, model: string }",
    });
  }

  const { make, model } = parsed.data;
  logger.info({ make, model }, "FRAM versions requested");

  try {
    const result = await Promise.race([
      listVersions(make, model),
      rejectAfter(ENDPOINT_TIMEOUT_MS, timeoutMessage()),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ make, model, err: message }, "FRAM versions route error");
    return res.json({ versions: [], error: message });
  }
});

framRouter.post("/catalogue", async (req, res) => {
  const parsed = catalogueBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      headers: [],
      rows: [],
      error:
        "Body inválido. Esperado: { make: string, model: string, version: string }",
    });
  }

  const { make, model, version } = parsed.data;
  logger.info({ make, model, version }, "FRAM catalogue requested");

  try {
    const result = await Promise.race([
      getCatalogue(make, model, version),
      rejectAfter(ENDPOINT_TIMEOUT_MS, timeoutMessage()),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { make, model, version, err: message },
      "FRAM catalogue route error",
    );
    return res.json({ headers: [], rows: [], error: message });
  }
});

framRouter.post("/resolve", async (req, res) => {
  const parsed = resolveBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      items: {},
      error: "Body inválido. Esperado: { codes: string[] }",
    });
  }

  const { codes } = parsed.data;
  logger.info({ count: codes.length }, "FRAM resolve requested");

  try {
    const result = await Promise.race([
      resolveProducts(codes),
      rejectAfter(ENDPOINT_TIMEOUT_MS, timeoutMessage()),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, count: codes.length }, "FRAM resolve route error");
    return res.json({ items: {}, error: message });
  }
});

function timeoutMessage(): string {
  return `Timeout: la búsqueda tardó más de ${ENDPOINT_TIMEOUT_MS / 1000} segundos`;
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}
