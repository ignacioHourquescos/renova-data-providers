import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";
import { fetchPriceListRows } from "./client.js";
import { buildPriceIndex } from "./parse.js";
import type { MaxoilPriceIndex } from "./types.js";

const config = providers.maxoil;

/** Las listas se bajan enteras, así que se reutilizan durante este tiempo. */
const PRICE_TTL_MS = 60 * 60 * 1000;

let cached: { loadedAt: number; index: MaxoilPriceIndex } | null = null;
let loadInFlight: Promise<MaxoilPriceIndex> | null = null;

/** Precios de los artículos WEGA por código de Maxoil, con cache en memoria. */
export async function getWegaPriceIndex(): Promise<MaxoilPriceIndex> {
  if (cached && Date.now() - cached.loadedAt < PRICE_TTL_MS) {
    return cached.index;
  }

  if (loadInFlight) {
    return loadInFlight;
  }

  loadInFlight = loadPriceIndex()
    .then((index) => {
      cached = { loadedAt: Date.now(), index };
      return index;
    })
    .finally(() => {
      loadInFlight = null;
    });

  return loadInFlight;
}

async function loadPriceIndex(): Promise<MaxoilPriceIndex> {
  const [unitLists, closedBoxRows] = await Promise.all([
    Promise.all(config.wegaPriceLists.map((listId) => fetchPriceListRows(listId))),
    fetchPriceListRows(config.wegaClosedBoxPriceList),
  ]);

  const index = buildPriceIndex(unitLists, closedBoxRows);
  if (index.size === 0) {
    throw new Error("Maxoil precios: las listas vinieron vacías");
  }

  logger.info({ count: index.size }, "Maxoil price lists loaded");
  return index;
}
