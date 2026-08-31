import { logger } from "../../lib/logger.js";
import { LruCache } from "../../lib/lruCache.js";
import { fetchCatalogue, fetchModelsByMakeId } from "./client.js";
import { WEGA_MAKES } from "./makes.js";
import { resolveProducts } from "./resolve.js";
import type {
  WegaCatalogueResult,
  WegaMakesResult,
  WegaModel,
  WegaModelsResult,
} from "./types.js";

export { resolveProducts };

const MODELS_CACHE_MAX = 400;
const MODELS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const modelsCache = new LruCache<WegaModel[]>(MODELS_CACHE_MAX, MODELS_CACHE_TTL_MS);
const modelsInflight = new Map<string, Promise<WegaModel[]>>();

export function listMakes(): WegaMakesResult {
  return { makes: WEGA_MAKES, error: null };
}

export async function listModels(makeId: string): Promise<WegaModelsResult> {
  const key = String(makeId ?? "").trim();
  if (!key) return { models: [], error: "Falta la marca" };

  const cached = modelsCache.get(key);
  if (cached?.length) {
    logger.info({ makeId: key, count: cached.length, cache: true }, "Wega models OK");
    return { models: cached, error: null };
  }

  try {
    let pending = modelsInflight.get(key);
    if (!pending) {
      pending = fetchModelsByMakeId(key).finally(() => {
        modelsInflight.delete(key);
      });
      modelsInflight.set(key, pending);
    }
    const models = await pending;
    if (models.length) modelsCache.set(key, models);
    logger.info({ makeId: key, count: models.length }, "Wega models OK");
    return { models, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ makeId: key, err: message }, "Wega models error");
    return { models: [], error: message };
  }
}

export async function getCatalogue(
  make: string,
  model: string,
  tipoVehiculo?: string,
): Promise<WegaCatalogueResult> {
  try {
    const data = await fetchCatalogue(make, model, tipoVehiculo);
    logger.info(
      { make, model, rows: data.rows.length, headers: data.headers.length },
      "Wega catalogue OK",
    );
    return { ...data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ make, model, err: message }, "Wega catalogue error");
    return { headers: [], rows: [], error: message };
  }
}
