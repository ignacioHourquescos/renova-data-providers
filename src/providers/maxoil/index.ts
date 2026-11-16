import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";
import { fetchExactStock } from "./client.js";
import {
  isExactArticleMatch,
  normalizeCode,
  parseStockRow,
  toArticleCode,
  toPriceInfo,
} from "./parse.js";
import { getWegaPriceIndex } from "./prices.js";
import type {
  MaxoilArticle,
  MaxoilPriceIndex,
  MaxoilSearchResult,
} from "./types.js";

export { normalizeCode } from "./parse.js";

const config = providers.maxoil;
const WEGA_BRAND = "WEGA";

/**
 * Stock y precio de un código WEGA en Maxoil. Solo devuelve el artículo si el código
 * coincide exacto: la API de Maxoil también responde con coincidencias parciales.
 * Si las listas de precios fallan, el stock se devuelve igual y el motivo va en `priceError`.
 */
export async function searchWegaByCode(query: string): Promise<MaxoilSearchResult> {
  const q = query.trim();
  if (!q) {
    return { items: [], priceError: null, error: "query vacío" };
  }

  const prefix = config.wegaCodePrefix;

  try {
    const [rows, prices] = await Promise.all([
      fetchExactStock(toArticleCode(q, prefix)),
      loadPrices(),
    ]);

    const items: MaxoilArticle[] = rows
      .filter((row) => isExactArticleMatch(row.COD_ART, q, prefix))
      .map((row) => ({
        ...parseStockRow(row, prefix, WEGA_BRAND),
        ...toPriceInfo(
          prices.index?.get(normalizeCode(row.COD_ART ?? "")),
          config.discountPercent,
        ),
      }));

    logger.info(
      { query: q, count: items.length, rawCount: rows.length },
      "Maxoil WEGA search OK",
    );
    return { items, priceError: prices.error, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query: q, err: message }, "Maxoil WEGA search error");
    return { items: [], priceError: null, error: message };
  }
}

async function loadPrices(): Promise<{
  index: MaxoilPriceIndex | null;
  error: string | null;
}> {
  try {
    return { index: await getWegaPriceIndex(), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, "Maxoil price lists failed");
    return { index: null, error: message };
  }
}

export type { MaxoilArticle, MaxoilSearchResult };
