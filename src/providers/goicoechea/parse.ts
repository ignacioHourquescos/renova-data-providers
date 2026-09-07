import type { GoicoecheaApiProduct, GoicoecheaArticle } from "./types.js";

const IN_STOCK_STATES = new Set(["1", "12"]);

/** Compara códigos ignorando espacios, guiones, barras y mayúsculas. */
export function normalizeCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function isExactCodeMatch(articleCode: string | null, query: string): boolean {
  if (!articleCode) return false;
  return normalizeCode(articleCode) === normalizeCode(query);
}

export function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? roundMoney(value) : null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "?") return null;

  const cleaned = trimmed.replace(/\$/g, "").replace(/\s/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "number") return value === 0;
  return false;
}

/**
 * Misma lógica que deduceProductCost() del JS de Goicoechea:
 * promo si existe, si no PRICE_WITH_DISCOUNT_SHOW (el Costo de la ficha).
 */
export function deduceCost(prod: GoicoecheaApiProduct): number | null {
  const promo = toNumber(prod.PROMOPRICE);
  if (!isEmptyValue(prod.PROMOPRICE) && promo != null && promo > 0) {
    const withDiscount = toNumber(prod.PRICE_WITH_DISCOUNT);
    if (withDiscount == null) return promo;
    return Math.min(promo, withDiscount);
  }
  return toNumber(prod.PRICE_WITH_DISCOUNT_SHOW ?? prod.PRICE_WITH_DISCOUNT);
}

export function parseProduct(raw: GoicoecheaApiProduct): GoicoecheaArticle {
  return {
    code: raw.prod_mscode?.trim() || null,
    name: raw.prod_description?.trim() || null,
    brand: raw.fam_name?.trim() || raw.lin_name?.trim() || null,
    price: deduceCost(raw),
    listPrice: toNumber(raw.prod_listprice),
    inStock: null,
    stockLabel: null,
    quantity: 1,
  };
}

export function mapAvailability(
  stateId: number | string | null | undefined,
  description?: string | null,
): { inStock: boolean; stockLabel: string } {
  const key = stateId == null ? "" : String(stateId).trim();
  const inStock = IN_STOCK_STATES.has(key);
  const fallback = stockLabelForState(key, inStock);
  const stockLabel = description?.trim() || fallback;
  return { inStock, stockLabel };
}

function stockLabelForState(stateId: string, inStock: boolean): string {
  if (inStock) {
    return stateId === "12"
      ? "DISPONEMOS DE STOCK (CON REEMPLAZOS)"
      : "DISPONEMOS DE STOCK";
  }
  switch (stateId) {
    case "2":
      return "CON STOCK PERO INSUFICIENTE PARA EL PEDIDO";
    case "3":
      return "SIN STOCK";
    case "5":
    case "chequear":
      return "CHEQUEAR EN FÁBRICA";
    case "9":
      return "PRODUCTO NO ENCONTRADO";
    case "entransito":
      return "CON STOCK EN TRÁNSITO";
    default:
      return "SIN STOCK";
  }
}

export function productIdOf(raw: GoicoecheaApiProduct): string | null {
  if (raw.prod_id == null || raw.prod_id === "") return null;
  return String(raw.prod_id);
}
