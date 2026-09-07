import { logger } from "../../lib/logger.js";
import { getOneProduct, searchProducts, withAvailability } from "./client.js";
import { isExactCodeMatch } from "./parse.js";
import type {
  GoicoecheaApiProduct,
  GoicoecheaArticle,
  GoicoecheaSearchResult,
} from "./types.js";

export { normalizeCode, isExactCodeMatch } from "./parse.js";

/**
 * Busca un código en Goicoechea (sesión + buscador JSON) y consulta stock
 * para la cantidad pedida (default 1).
 */
export async function searchByCode(
  query: string,
  quantity = 1,
): Promise<GoicoecheaSearchResult> {
  const q = query.trim();
  if (!q) {
    return { items: [], error: "query vacío" };
  }

  try {
    const raw = await searchProducts(q);
    let matched = raw.filter((item) => isExactCodeMatch(item.prod_mscode ?? null, q));

    if (matched.length === 0) {
      const fallback = await getOneProduct(q, quantity);
      if (fallback && isExactCodeMatch(fallback.prod_mscode ?? null, q)) {
        matched = [fallback];
      }
    }

    const items = await mapWithAvailability(matched, quantity);

    logger.info(
      { query: q, quantity, count: items.length, rawCount: raw.length },
      "Goicoechea search OK",
    );
    return { items, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query: q, quantity, err: message }, "Goicoechea search error");
    return { items: [], error: message };
  }
}

async function mapWithAvailability(
  products: GoicoecheaApiProduct[],
  quantity: number,
): Promise<GoicoecheaArticle[]> {
  const items: GoicoecheaArticle[] = [];
  for (const product of products) {
    items.push(await withAvailability(product, quantity));
  }
  return items;
}
