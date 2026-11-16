import { applyDiscount } from "../config.js";
import { getFixedMarkupPercent } from "../pricing.js";
import type {
  MaxoilApiStockRow,
  MaxoilPriceEntry,
  MaxoilPriceIndex,
  MaxoilPriceInfo,
  MaxoilPriceListRow,
  MaxoilStockInfo,
} from "./types.js";

/** Compara códigos ignorando espacios, guiones, barras y mayúsculas. */
export function normalizeCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Código de artículo como lo guarda Maxoil: prefijo de marca + código sin separadores. */
export function toArticleCode(code: string, prefix: string): string {
  return `${prefix}${normalizeCode(code)}`;
}

export function isExactArticleMatch(
  articleCode: string | null | undefined,
  query: string,
  prefix: string,
): boolean {
  if (!articleCode) return false;
  return normalizeCode(articleCode) === toArticleCode(query, prefix);
}

/**
 * Estados de `get_exact_basic`, los mismos que distingue el JS del portal.
 * `no_disponible` y cualquier estado desconocido quedan en null: Maxoil no dice si hay stock.
 */
export function mapStock(
  estado: string | null | undefined,
  badge?: string | null,
): Pick<MaxoilStockInfo, "inStock" | "stockLabel" | "stockStatus"> {
  const stockStatus = estado?.trim().toLowerCase() || null;
  const stockLabel = badge?.trim() || null;

  let inStock: boolean | null = null;
  if (stockStatus === "en_stock" || stockStatus === "poco_stock") inStock = true;
  else if (stockStatus === "sin_stock") inStock = false;

  return { inStock, stockLabel, stockStatus };
}

/**
 * `DES_ART` viene como "FAP-2219 - VW Fox / Suran /": el código con su formato
 * original y después la descripción. Si no tiene esa forma, se deja entero como nombre.
 */
export function parseStockRow(
  row: MaxoilApiStockRow,
  prefix: string,
  brand: string,
): MaxoilStockInfo {
  const articleCode = normalizeCode(row.COD_ART ?? "");
  const bareCode = articleCode.startsWith(prefix)
    ? articleCode.slice(prefix.length)
    : articleCode;

  const description = row.DES_ART?.trim() ?? "";
  let code: string | null = bareCode || null;
  let name: string | null = description || null;

  const separator = description.indexOf(" - ");
  if (separator > 0) {
    const head = description.slice(0, separator).trim();
    if (bareCode && normalizeCode(head) === bareCode) {
      code = head;
      name = description.slice(separator + 3).trim() || null;
    }
  }

  return {
    code,
    name,
    brand,
    ...mapStock(row.STOCK_ESTADO, row.STOCK_BADGE),
  };
}

/** "$7.773" → 7773. El portal usa punto de miles; la coma decimal se acepta por si aparece. */
export function parseListPrice(text: string | null | undefined): number | null {
  const cleaned = (text ?? "").replace(/[^\d,]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * La página de una lista trae los artículos en
 * `<script type="application/json" id="priceListDynamicPayload">`, mezclados con
 * títulos de sección. El precio es la última celda de cada fila.
 * Devuelve null si la página no trae la lista.
 */
export function extractPriceListRows(html: string): MaxoilPriceListRow[] | null {
  const match = /<script[^>]*id="priceListDynamicPayload"[^>]*>([\s\S]*?)<\/script>/i.exec(
    html,
  );
  if (!match?.[1]) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const items = (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;

  const rows: MaxoilPriceListRow[] = [];
  for (const item of items as Array<Record<string, unknown> | null>) {
    if (item?.type !== "row" || typeof item.code !== "string") continue;
    const cells = Array.isArray(item.cells) ? item.cells : [];
    const price = cells[cells.length - 1];
    if (typeof price !== "string") continue;
    rows.push({ code: item.code, price });
  }
  return rows;
}

/**
 * Junta las listas en un índice por código de artículo. Si un código se repite
 * entre listas de precio unitario, queda el de la primera.
 */
export function buildPriceIndex(
  unitLists: MaxoilPriceListRow[][],
  closedBoxRows: MaxoilPriceListRow[],
): MaxoilPriceIndex {
  const index: MaxoilPriceIndex = new Map();

  for (const rows of unitLists) {
    for (const row of rows) {
      const key = normalizeCode(row.code);
      if (!key || index.has(key)) continue;
      index.set(key, { listPrice: parseListPrice(row.price), closedBoxListPrice: null });
    }
  }

  for (const row of closedBoxRows) {
    const key = normalizeCode(row.code);
    if (!key) continue;
    const entry = index.get(key) ?? { listPrice: null, closedBoxListPrice: null };
    entry.closedBoxListPrice = parseListPrice(row.price);
    index.set(key, entry);
  }

  return index;
}

export function toPriceInfo(
  entry: MaxoilPriceEntry | undefined,
  discountPercent: number,
  markupPercent = getFixedMarkupPercent("maxoil", "WEGA") ?? 0,
): MaxoilPriceInfo {
  const listPrice = entry?.listPrice ?? null;
  return {
    price: applyDiscount(listPrice, discountPercent),
    listPrice,
    discountPercent,
    markupPercent,
    closedBoxPrice: applyDiscount(entry?.closedBoxListPrice ?? null, discountPercent),
  };
}

/** Lee `<meta name="csrf-token" content="...">` del HTML del portal. */
export function extractCsrfToken(html: string): string | null {
  const match = /<meta\s+name="csrf-token"\s+content="([^"]+)"/i.exec(html);
  return match?.[1]?.trim() || null;
}
