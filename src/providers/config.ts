/**
 * Config central de scrapers / proveedores.
 * Acá viven URLs, descuentos, credenciales y metadatos.
 */
export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  origin: string;
  referer: string;
  /** Descuento adicional a aplicar sobre el precio del proveedor (0–100). */
  discountPercent: number;
  authHeader: string;
  username: string;
  password: string;
};

export const providers = {
  lubaires: {
    id: "lubaires",
    name: "Lubaires",
    baseUrl: "https://api.lubaires.com.ar/v1",
    origin: "https://www.lubaires.com.ar",
    referer: "https://www.lubaires.com.ar/",
    discountPercent: 30,
    authHeader: "x-access-token",
    username: "1183",
    password: "001183",
  },
} as const satisfies Record<string, ProviderConfig>;

export type ProviderId = keyof typeof providers;

/** Aplica descuento porcentual. Ej: 100 con 30% → 70. */
export function applyDiscount(
  price: number | null,
  discountPercent: number,
): number | null {
  if (price == null) return null;
  if (!Number.isFinite(price)) return null;
  const factor = 1 - discountPercent / 100;
  return roundMoney(price * factor);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
