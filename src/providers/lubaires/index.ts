import { logger } from "../../lib/logger.js";
import { parseArticle, searchArticles } from "./client.js";
import type { LubairesBrand, LubairesSearchResult } from "./types.js";

export type { LubairesBrand };

/**
 * Busca artículos en Lubaires por código, filtrando por marca y match exacto de código.
 * Lubaires devuelve resultados fuzzy de varias marcas; acá nos quedamos solo con
 * el/los ítems cuyo código (normalizado) coincide y cuya marca es la pedida.
 */
export async function searchByCode(
  query: string,
  brand: LubairesBrand,
): Promise<LubairesSearchResult> {
  const q = query.trim();
  if (!q) {
    return { items: [], error: "query vacío" };
  }

  try {
    const raw = await searchArticles(q);
    const items = raw
      .map(parseArticle)
      .filter((item) => matchesBrand(item.brand, brand) && isExactCodeMatch(item.code, q));

    logger.info(
      { query: q, brand, count: items.length, rawCount: raw.length },
      "Lubaires search OK",
    );
    return { items, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ query: q, brand, err: message }, "Lubaires search error");
    return { items: [], error: message };
  }
}

/** Lubaires manda "MANN FILTER" / "MANN-FILTER"; pedimos MANN o WIX. */
export function matchesBrand(brandName: string | null | undefined, brand: LubairesBrand): boolean {
  const raw = String(brandName || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!raw) return false;
  return raw === brand || raw.startsWith(brand);
}

/** "C 2295/2 (10)" → "C 2295/2" (el (10) es presentación, no el código). */
export function stripPackSuffix(code: string): string {
  return String(code || "").replace(/\s*\(\d+\)\s*$/g, "").trim();
}

/** Compara códigos ignorando espacios, guiones, barras y mayúsculas/minúsculas. */
export function normalizeCode(code: string): string {
  return stripPackSuffix(code).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function isExactCodeMatch(
  articleCode: string | null,
  query: string,
): boolean {
  if (!articleCode) return false;
  return normalizeCode(articleCode) === normalizeCode(query);
}
