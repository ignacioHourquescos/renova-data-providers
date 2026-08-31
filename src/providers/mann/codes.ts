const SKU_SUFFIX = "_MANN-FILTER";

/** Normaliza un código MANN a clave de cache (sin espacios, upper). */
export function normalizeMannCode(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "")
    .replace(/MANNFILTER$/i, "");
}

/** Convierte input de usuario a SKU Magento (`C27030_MANN-FILTER`). */
export function toMannSku(raw: string): string {
  const key = normalizeMannCode(raw);
  if (!key) return "";
  if (key.endsWith("MANNFILTER")) {
    const base = key.replace(/MANNFILTER$/i, "");
    return `${base}${SKU_SUFFIX}`;
  }
  return `${key}${SKU_SUFFIX}`;
}

/** SKU / product_name → código legible (`C27030`). */
export function displayMannCode(skuOrName: string | null | undefined): string {
  const raw = String(skuOrName ?? "").trim();
  if (!raw) return "";
  const withoutSuffix = raw.replace(/_MANN-FILTER$/i, "").trim();
  return withoutSuffix || raw;
}

export function emptyResolvedProduct(code: string): {
  mannCode: string;
  sku: string | null;
  imageUrl: string | null;
  framCodes: string[];
  wegaCodes: string[];
  equivalencias: never[];
} {
  return {
    mannCode: displayMannCode(code) || code,
    sku: null,
    imageUrl: null,
    framCodes: [],
    wegaCodes: [],
    equivalencias: [],
  };
}

export function isPlaceholderImage(url: string | null | undefined): boolean {
  if (!url) return true;
  return /placeholder/i.test(url);
}
