import { logger } from "../../lib/logger.js";
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
  FramModelsResult,
  FramVersionsResult,
} from "./types.js";

export { resolveProducts };

export function listMakes(): FramMakesResult {
  return { makes: FRAM_MAKES, error: null };
}

export async function listModels(make: string): Promise<FramModelsResult> {
  try {
    const models = await fetchModelsByMake(make);
    logger.info({ make, count: models.length }, "FRAM models OK");
    return { models, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ make, err: message }, "FRAM models error");
    return { models: [], error: message };
  }
}

export async function listVersions(
  make: string,
  model: string,
): Promise<FramVersionsResult> {
  try {
    const versions = await fetchVersions(make, model);
    logger.info({ make, model, count: versions.length }, "FRAM versions OK");
    return { versions, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ make, model, err: message }, "FRAM versions error");
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
