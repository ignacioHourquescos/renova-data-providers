import type { EagleApiItem, EagleArticle } from "./types.js";

/** Eagle oculta el número cuando la cantidad es mayor a 100. */
export const QUANTITY_HIDE_OVER = 100;

const BRAND_KEYS = new Set(["marca", "brand"]);
const WAREHOUSE_KEYS = ["almacen", "almacén", "deposito", "depósito"];

/**
 * Misma normalización que Eagle (`normalizeSearchText`):
 * ignora espacios, guiones, barras y mayúsculas.
 */
export function normalizeCode(value: string): string {
  return value.toLowerCase().replace(/[\s\-_.\/\\\u2010\u2011\u2013\u2014]+/g, "");
}

export function isExactCodeMatch(articleCode: string | null | undefined, query: string): boolean {
  const left = normalizeCode(articleCode ?? "");
  const right = normalizeCode(query);
  if (!left || !right) return false;
  return left === right;
}

export function brandFromFields(fields: Record<string, string>): string | null {
  const entries = Object.entries(fields).filter(([, value]) => value.trim());
  const byKey = (wanted: (key: string) => boolean) =>
    entries.find(([key]) => wanted(foldKey(key)))?.[1]?.trim() || null;

  return (
    byKey((key) => BRAND_KEYS.has(key)) ??
    byKey((key) => WAREHOUSE_KEYS.some((name) => key.includes(name)))
  );
}

export function parseStockItem(
  raw: EagleApiItem,
  requested = 1,
): EagleArticle {
  const quantity =
    typeof raw.quantity === "number" && Number.isFinite(raw.quantity) ? raw.quantity : null;
  const quantityLabel = raw.quantityLabel?.trim() || null;
  const fields = normalizeFields(raw.fields);
  const availability = stockAvailability(quantity, quantityLabel, requested);

  return {
    code: raw.sku.trim(),
    name: raw.description?.trim() || null,
    brand: brandFromFields(fields),
    quantity,
    quantityLabel,
    requested,
    inStock: availability.inStock,
    stockLabel: availability.stockLabel,
    fields,
  };
}

export function stockAvailability(
  quantity: number | null,
  quantityLabel: string | null,
  requested: number,
): { inStock: boolean | null; stockLabel: string } {
  if (quantityLabel) {
    return {
      inStock: requested <= QUANTITY_HIDE_OVER ? true : null,
      stockLabel: quantityLabel,
    };
  }
  if (quantity == null) {
    return { inStock: null, stockLabel: "SIN DATO" };
  }
  if (quantity <= 0) {
    return { inStock: false, stockLabel: "SIN STOCK" };
  }
  return {
    inStock: quantity >= requested,
    stockLabel: String(quantity),
  };
}

function normalizeFields(fields: Record<string, string> | null | undefined): Record<string, string> {
  if (!fields) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && value.trim()) out[key] = value;
  }
  return out;
}

function foldKey(key: string): string {
  return key.trim().toLowerCase();
}
