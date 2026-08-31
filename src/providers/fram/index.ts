import { logger } from "../../lib/logger.js";
import { LruCache } from "../../lib/lruCache.js";
import {
  fetchCatalogue,
  fetchModelsByMake,
  fetchVersions,
} from "./client.js";
import { FRAM_MAKES } from "./makes.js";
import { resolveProducts } from "./resolve.js";
import type {
  FramCatalogueResult,
  FramMakesResult,
  FramModel,
  FramModelsResult,
  FramVersion,
  FramVersionsResult,
} from "./types.js";

export { resolveProducts };

const MODELS_CACHE_MAX = 200;
const MODELS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const modelsCache = new LruCache<FramModel[]>(MODELS_CACHE_MAX, MODELS_CACHE_TTL_MS);
const modelsInflight = new Map<string, Promise<FramModel[]>>();
const versionsCache = new LruCache<FramVersion[]>(400, MODELS_CACHE_TTL_MS);
const versionsInflight = new Map<string, Promise<FramVersion[]>>();

export function listMakes(): FramMakesResult {
  return { makes: FRAM_MAKES, error: null };
}

export async function listModels(make: string): Promise<FramModelsResult> {
  const key = String(make ?? "").trim();
  if (!key) return { models: [], error: "Falta la marca" };

  const cached = modelsCache.get(key);
  if (cached?.length) {
    logger.info({ make: key, count: cached.length, cache: true }, "FRAM models OK");
    return { models: cached, error: null };
  }

  try {
    let pending = modelsInflight.get(key);
    if (!pending) {
      pending = fetchModelsByMake(key).finally(() => {
        modelsInflight.delete(key);
      });
      modelsInflight.set(key, pending);
    }
    const models = await pending;
    if (models.length) modelsCache.set(key, models);
    logger.info({ make: key, count: models.length }, "FRAM models OK");
    return { models, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ make: key, err: message }, "FRAM models error");
    return { models: [], error: message };
  }
}

export async function listVersions(
  make: string,
  model: string,
): Promise<FramVersionsResult> {
  const makeKey = String(make ?? "").trim();
  const modelKey = String(model ?? "").trim();
  const cacheKey = `${makeKey}|${modelKey}`;
  if (!makeKey || !modelKey) {
    return { versions: [], error: "Faltan marca y modelo" };
  }

  const cached = versionsCache.get(cacheKey);
  if (cached?.length) {
    logger.info(
      { make: makeKey, model: modelKey, count: cached.length, cache: true },
      "FRAM versions OK",
    );
    return { versions: cached, error: null };
  }

  try {
    let pending = versionsInflight.get(cacheKey);
    if (!pending) {
      pending = fetchVersions(makeKey, modelKey).finally(() => {
        versionsInflight.delete(cacheKey);
      });
      versionsInflight.set(cacheKey, pending);
    }
    const versions = await pending;
    if (versions.length) versionsCache.set(cacheKey, versions);
    logger.info(
      { make: makeKey, model: modelKey, count: versions.length },
      "FRAM versions OK",
    );
    return { versions, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ make: makeKey, model: modelKey, err: message }, "FRAM versions error");
    return { versions: [], error: message };
  }
}

export async function getCatalogue(
  make: string,
  model: string,
  version: string,
): Promise<FramCatalogueResult> {
  try {
    const data = await fetchCatalogue(make, model, version);
    logger.info(
      {
        make,
        model,
        version,
        rows: data.rows.length,
        headers: data.headers.length,
      },
      "FRAM catalogue OK",
    );
    return { ...data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ make, model, version, err: message }, "FRAM catalogue error");
    return { headers: [], rows: [], error: message };
  }
}
