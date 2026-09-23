import { logger } from "../../lib/logger.js";
import { findBySku, searchStock } from "./client.js";
import { isExactCodeMatch, parseStockItem } from "./parse.js";
import type { EagleApiItem, EagleArticle, EagleSearchResult } from "./types.js";

export { isExactCodeMatch, normalizeCode } from "./parse.js";

/**
 * Busca un código en Eagle. Se queda con los ítems cuyo código coincide
 * (ignorando espacios, guiones y mayúsculas). Si la búsqueda paginada no
 * lo trae, prueba el lookup exacto por SKU.
 */
export async function searchByCode(
  query: string,
  requested = 1,
): Promise<EagleSearchResult> {
  const q = query.trim();
  const quantity = normalizeRequested(requested);
  if (!q) {
    return { items: [], updatedAt: null, error: "query vacío" };
  }

  try {
    const page = await searchStock(q);
    let updatedAt = page.updatedAt;
    const matched = page.items.filter((item) => isExactCodeMatch(item.sku, q));

    if (matched.length === 0) {
      const direct = await findBySku(q);
      if (direct && isExactCodeMatch(direct.item.sku, q)) {
        matched.push(direct.item);
        updatedAt = direct.updatedAt ?? updatedAt;
      }
    }

    const items = dedupe(matched).map((item) => parseStockItem(item, quantity));
    logger.info(
      { query: q, quantity, count: items.length, rawCount: page.items.length },
      "Eagle search OK",
    );
    return { items, updatedAt, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query: q, quantity, err: message }, "Eagle search error");
    return { items: [], updatedAt: null, error: message };
  }
}

function normalizeRequested(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return 1;
  return Math.max(1, Math.floor(requested));
}

function dedupe(items: EagleApiItem[]): EagleApiItem[] {
  const seen = new Set<string>();
  const unique: EagleApiItem[] = [];
  for (const item of items) {
    const key = [
      item.sku,
      item.description ?? "",
      item.quantity ?? "",
      item.quantityLabel ?? "",
      JSON.stringify(item.fields ?? {}),
    ].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

export type { EagleArticle, EagleSearchResult };
