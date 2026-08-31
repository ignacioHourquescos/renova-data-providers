import { Router } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import {
  getCatalogue,
  listMakes,
  listModels,
  listVersions,
  resolveProducts,
} from "../providers/mann/index.js";

export const mannRouter = Router();

const ENDPOINT_TIMEOUT_MS = 60_000;

const idSchema = z.union([z.string().min(1), z.number()]).transform(String);

const makesBodySchema = z.object({
  search: idSchema,
});

const modelsBodySchema = z.object({
  id: idSchema,
  categoryId: idSchema.optional(),
  q: z.string().optional(),
});

const versionsBodySchema = z
  .object({
    model: idSchema.optional(),
    make: idSchema.optional(),
    id: idSchema.optional(),
  })
  .refine((b) => Boolean(b.model || b.id), {
    message: "Falta model (modelSeriesId)",
  });

const catalogueBodySchema = z
  .object({
    version: idSchema.optional(),
    modelTypeId: idSchema.optional(),
    make: idSchema.optional(),
    model: idSchema.optional(),
  })
  .refine((b) => Boolean(b.version || b.modelTypeId), {
    message: "Falta version (modelTypeId)",
  });

const resolveBodySchema = z.object({
  codes: z.array(z.union([z.string(), z.number()]).transform(String)),
});

mannRouter.post("/makes", async (req, res) => {
  const parsed = makesBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      makes: [],
      error: "Body inválido. Esperado: { search: string }",
    });
  }

  const { search } = parsed.data;
  logger.info({ search }, "MANN makes requested");

  try {
    const result = await Promise.race([
      listMakes(search),
      rejectAfter(ENDPOINT_TIMEOUT_MS, timeoutMessage()),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ search, err: message }, "MANN makes route error");
    return res.json({ makes: [], error: message });
  }
});

mannRouter.post("/models", async (req, res) => {
  const parsed = modelsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      models: [],
      error:
        "Body inválido. Esperado: { id: string, categoryId?: string, q?: string }",
    });
  }

  const { id, categoryId, q } = parsed.data;
  logger.info({ id, categoryId, q }, "MANN models requested");

  try {
    const result = await Promise.race([
      listModels({ brandId: id, categoryId, q }),
      rejectAfter(ENDPOINT_TIMEOUT_MS, timeoutMessage()),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ id, err: message }, "MANN models route error");
    return res.json({ models: [], error: message });
  }
});

mannRouter.post("/versions", async (req, res) => {
  const parsed = versionsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      versions: [],
      error: "Body inválido. Esperado: { model: string } (modelSeriesId)",
    });
  }

  const modelSeriesId = parsed.data.model ?? parsed.data.id ?? "";
  logger.info(
    { model: modelSeriesId, make: parsed.data.make },
    "MANN versions requested",
  );

  try {
    const result = await Promise.race([
      listVersions(modelSeriesId),
      rejectAfter(ENDPOINT_TIMEOUT_MS, timeoutMessage()),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ model: modelSeriesId, err: message }, "MANN versions route error");
    return res.json({ versions: [], error: message });
  }
});

mannRouter.post("/catalogue", async (req, res) => {
  const parsed = catalogueBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      items: [],
      filters: [],
      totalCount: 0,
      error: "Body inválido. Esperado: { version: string } (modelTypeId)",
    });
  }

  const modelTypeId = parsed.data.version ?? parsed.data.modelTypeId ?? "";
  logger.info(
    {
      version: modelTypeId,
      make: parsed.data.make,
      model: parsed.data.model,
    },
    "MANN catalogue requested",
  );

  try {
    const result = await Promise.race([
      getCatalogue(modelTypeId),
      rejectAfter(ENDPOINT_TIMEOUT_MS, timeoutMessage()),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { version: modelTypeId, err: message },
      "MANN catalogue route error",
    );
    return res.json({ items: [], filters: [], totalCount: 0, error: message });
  }
});

mannRouter.post("/resolve", async (req, res) => {
  const parsed = resolveBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      items: {},
      error: "Body inválido. Esperado: { codes: string[] }",
    });
  }

  const { codes } = parsed.data;
  logger.info({ count: codes.length }, "MANN resolve requested");

  try {
    const result = await Promise.race([
      resolveProducts(codes),
      rejectAfter(ENDPOINT_TIMEOUT_MS, timeoutMessage()),
    ]);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, count: codes.length }, "MANN resolve route error");
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
