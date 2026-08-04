/**
 * Config central de scrapers / proveedores.
 * Acá viven URLs, descuentos, tokens y metadatos.
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
  accessToken: string;
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
    accessToken:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiQ1VTVE9NRVIiLCJyb2xlVHJhbnNsYXRlZCI6IkNMSUVOVEUiLCJpZCI6IjExODMiLCJuYW1lIjoiR1JPU1NPIEZJT1JFIiwidXNlcm5hbWUiOm51bGwsImJyYW5jaF9pZCI6IjEiLCJncm91cCI6bnVsbCwicGF5bWVudF9jb25kaXRpb25faWQiOiI0Iiwic2VsbGVyX2lkIjoiMTEiLCJwcmljZV9saXN0X2lkIjoiMiIsInNvdXJjZSI6IldFQiIsImN1c3RvbWVyc191c2VyX2lkIjpudWxsLCJjdXN0b21lcnNfdXNlcl9uYW1lIjpudWxsLCJjdXN0b21lcnNfdXNlcl9wcm9maWxlIjpudWxsLCJsb2dpbl9pZCI6ImUxNDdmMGI4LTI3MTYtNDQ2YS05MDE1LTA1MjFkODQ3NzUzMSIsImxvZ2luX3JvbGUiOiJDVVNUT01FUiIsImxvZ2luX3VzZXJfaWQiOm51bGwsInNob3dfc3VnZ2VzdGVkX3ByaWNlIjp0cnVlLCJwYXltZW50X2NvbmRpdGlvbl9wZXJjZW50YWdlIjpudWxsLCJ0eXBlIjoiV0hPTEVTQUxFIiwiZXhwaXJlc0luIjoiMWQiLCJleHBpcmF0aW9uIjoiMjAyNi0wOC0wNSAxMTo0MTo0NCIsImlhdCI6MTc4NTg1NDUwNCwiZXhwIjoxNzg1OTQwOTA0fQ.Ct-9SUkfk5jhoAVEMFzRHgRL2p_QnaAk0SiIB0MiA2w",
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
