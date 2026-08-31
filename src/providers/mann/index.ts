import { logger } from "../../lib/logger.js";
import { LruCache } from "../../lib/lruCache.js";
import {
  fetchBrandSuggestions,
  fetchCatalogueByType,
  fetchModelsByBrand,
  fetchVersionsBySeries,
} from "./client.js";
import { resolveProducts } from "./resolve.js";
import type {
  MannCatalogueResult,
  MannMakesResult,
  MannModel,
  MannModelsResult,
  MannVersion,
  MannVersionsResult,
} from "./types.js";

export { resolveProducts };

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const modelsCache = new LruCache<MannModel[]>(200, CACHE_TTL_MS);
const modelsInflight = new Map<string, Promise<MannModel[]>>();
const versionsCache = new LruCache<MannVersion[]>(400, CACHE_TTL_MS);
const versionsInflight = new Map<string, Promise<MannVersion[]>>();

export async function listMakes(search: string): Promise<MannMakesResult> {
  const q = String(search ?? "").trim();
  if (!q) return { makes: [], error: "Falta search (marca)" };

  try {
    const makes = await fetchBrandSuggestions(q);
    logger.info({ search: q, count: makes.length }, "MANN makes OK");
    return { makes, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ search: q, err: message }, "MANN makes error");
    return { makes: [], error: message };
  }
}

export async function listModels(opts: {
  brandId: string;
  categoryId?: string;
  q?: string;
}): Promise<MannModelsResult> {
  const brandId = String(opts.brandId ?? "").trim();
  if (!brandId) return { models: [], error: "Falta la marca (brandId)" };

  const categoryId = String(opts.categoryId ?? "").trim();
  const q = String(opts.q ?? "").trim();
  const cacheKey = `${brandId}|${categoryId}|${q}`;

  const cached = modelsCache.get(cacheKey);
  if (cached?.length) {
    logger.info(
      { brandId, count: cached.length, cache: true },
      "MANN models OK",
    );
    return { models: cached, error: null };
  }

  try {
    let pending = modelsInflight.get(cacheKey);
    if (!pending) {
      pending = fetchModelsByBrand({
        brandId,
        categoryId: categoryId || undefined,
        modelName: q || undefined,
      }).finally(() => {
        modelsInflight.delete(cacheKey);
      });
      modelsInflight.set(cacheKey, pending);
    }
    const models = await pending;
    if (models.length) modelsCache.set(cacheKey, models);
    logger.info({ brandId, count: models.length }, "MANN models OK");
    return { models, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ brandId, err: message }, "MANN models error");
    return { models: [], error: message };
  }
}

export async function listVersions(
  modelSeriesId: string,
): Promise<MannVersionsResult> {
  const key = String(modelSeriesId ?? "").trim();
  if (!key) return { versions: [], error: "Falta el modelo (modelSeriesId)" };

  const cached = versionsCache.get(key);
  if (cached?.length) {
    logger.info(
      { modelSeriesId: key, count: cached.length, cache: true },
      "MANN versions OK",
    );
    return { versions: cached, error: null };
  }

  try {
    let pending = versionsInflight.get(key);
    if (!pending) {
      pending = fetchVersionsBySeries(key).finally(() => {
        versionsInflight.delete(key);
      });
      versionsInflight.set(key, pending);
    }
    const versions = await pending;
    if (versions.length) versionsCache.set(key, versions);
    logger.info({ modelSeriesId: key, count: versions.length }, "MANN versions OK");
    return { versions, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ modelSeriesId: key, err: message }, "MANN versions error");
    return { versions: [], error: message };
  }
}

export async function getCatalogue(
  modelTypeId: string,
): Promise<MannCatalogueResult> {
  const key = String(modelTypeId ?? "").trim();
  if (!key) {
    return { items: [], filters: [], totalCount: 0, error: "Falta la versión (modelTypeId)" };
  }

  try {
    const result = await fetchCatalogueByType({ modelTypeId: key });
    logger.info(
      { modelTypeId: key, count: result.items.length },
      "MANN catalogue OK",
    );
    return { ...result, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ modelTypeId: key, err: message }, "MANN catalogue error");
    return { items: [], filters: [], totalCount: 0, error: message };
  }
}
