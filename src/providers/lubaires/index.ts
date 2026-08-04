import { logger } from "../../lib/logger.js";
import { parseArticle, searchArticles } from "./client.js";
import type { LubairesSearchResult } from "./types.js";

/**
 * Busca artículos en Lubaires por código o texto (ej. WL10489A).
 */
export async function searchByCode(query: string): Promise<LubairesSearchResult> {
  const q = query.trim();
  if (!q) {
    return { items: [], error: "query vacío" };
  }

  try {
    const raw = await searchArticles(q);
    const items = raw.map(parseArticle);

    logger.info({ query: q, count: items.length }, "Lubaires search OK");
    return { items, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query: q, err: message }, "Lubaires search error");
    return { items: [], error: message };
  }
}
