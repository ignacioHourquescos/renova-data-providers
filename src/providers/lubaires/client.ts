import { logger } from "../../lib/logger.js";
import { applyDiscount, providers } from "../config.js";
import type { LubairesApiArticle, LubairesArticle } from "./types.js";

const config = providers.lubaires;

const BASE_HEADERS: Record<string, string> = {
  Accept: "application/json",
  Origin: config.origin,
  Referer: config.referer,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/**
 * GET /v1/articles — búsqueda por código/texto.
 * Auth: header x-access-token (JWT en providers/config.ts).
 */
export async function searchArticles(
  query: string,
  page = 1,
  perPage = 30,
): Promise<LubairesApiArticle[]> {
  if (!config.accessToken) {
    throw new Error("Lubaires accessToken no configurado en providers/config.ts");
  }

  const filters = JSON.stringify({ search: query });
  const params = new URLSearchParams({
    _page: String(page),
    _perPage: String(perPage),
    _sortDir: "-",
    _sortField: "match_score",
    _search: query,
    _filters: filters,
  });

  const url = `${config.baseUrl}/articles?${params.toString()}`;
  logger.debug({ query, page, perPage }, "Calling Lubaires articles API");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...BASE_HEADERS,
      [config.authHeader]: config.accessToken,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Lubaires API HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Lubaires API response inválida (se esperaba un array)");
  }

  return data as LubairesApiArticle[];
}

export function parseArticle(raw: LubairesApiArticle): LubairesArticle {
  const providerPrice = toNumber(
    raw.priceToShow ?? raw.finalPrice ?? raw.netPricePaymentConditionIva,
  );

  return {
    code: raw.supplier_code?.trim() || raw.titleToShow?.trim() || null,
    name:
      raw.descriptionToShow?.trim() ||
      raw.name?.trim() ||
      raw.description?.trim() ||
      null,
    brand: raw.brand?.name?.trim() || null,
    price: applyDiscount(providerPrice, config.discountPercent),
    providerPrice,
    listPrice: toNumber(raw.listPrice ?? raw.price),
    publicPrice: toNumber(raw.suggestedPrice),
    discountPercent: config.discountPercent,
    stockLabel: raw.available?.label?.trim() || null,
    stockStatus: raw.available?.status?.trim() || null,
    isOffer: Boolean(raw.isOffer),
  };
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
