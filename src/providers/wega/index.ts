import { logger } from "../../lib/logger.js";
import { fetchCatalogue, fetchModelsByMakeId } from "./client.js";
import { WEGA_MAKES } from "./makes.js";
import { resolveProducts } from "./resolve.js";
import type {
  WegaCatalogueResult,
  WegaMakesResult,
  WegaModelsResult,
} from "./types.js";

export { resolveProducts };

export function listMakes(): WegaMakesResult {
  return { makes: WEGA_MAKES, error: null };
}

export async function listModels(makeId: string): Promise<WegaModelsResult> {
  try {
    const models = await fetchModelsByMakeId(makeId);
    logger.info({ makeId, count: models.length }, "Wega models OK");
    return { models, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ makeId, err: message }, "Wega models error");
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
