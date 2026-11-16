import { getFixedDiscountPercent } from "./pricing.js";

/**
 * Config central de scrapers / proveedores.
 * Acá viven URLs, credenciales y metadatos.
 * Descuentos y markups comerciales: `src/providers/pricing.ts` (GET /api/pricing).
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

function requireDiscount(provider: string, brand?: string): number {
  const value = getFixedDiscountPercent(provider, brand);
  if (value == null) {
    throw new Error(`Falta discountPercent fijo en pricing.ts para ${provider}`);
  }
  return value;
}

export const providers = {
  lubaires: {
    id: "lubaires",
    name: "Lubaires",
    baseUrl: "https://api.lubaires.com.ar/v1",
    origin: "https://www.lubaires.com.ar",
    referer: "https://www.lubaires.com.ar/",
    discountPercent: requireDiscount("lubaires"),
    authHeader: "x-access-token",
    username: "1183",
    password: "001183",
  },
  wega: {
    id: "wega",
    name: "Wega",
    baseUrl: "https://wega.com.ar",
    origin: "https://wega.com.ar",
    referer: "https://wega.com.ar/catalogo",
  },
  fram: {
    id: "fram",
    name: "FRAM",
    baseUrl: "https://catalogofram.com.ar",
    origin: "https://catalogofram.com.ar",
    referer: "https://catalogofram.com.ar/",
  },
  mann: {
    id: "mann",
    name: "MANN-FILTER",
    baseUrl: "https://www.mann-filter.com",
    origin: "https://www.mann-filter.com",
    referer: "https://www.mann-filter.com/ar-es/catalogo.html",
    graphqlUrl: "https://www.mann-filter.com/api/graphql/catalog-prod",
  },
  goicoechea: {
    id: "goicoechea",
    name: "Goicoechea",
    baseUrl: "https://goicoechea.com.ar",
    origin: "https://goicoechea.com.ar",
    referer: "https://goicoechea.com.ar/cuenta/buscador",
    username: "renovafiltros@gmail.com",
    password: "4d7f4c38",
  },
  eagle: {
    id: "eagle",
    name: "Eagle",
    baseUrl: "https://eagle-stock.up.railway.app",
    apiKey: "eagle_yZTsBJnYCKWrf_WaY_POyE58jfD3NMKTwLg4IwE5MLI",
  },
  maxoil: {
    id: "maxoil",
    name: "Maxoil",
    baseUrl: "https://clientes.maxoil.info",
    origin: "https://clientes.maxoil.info",
    referer: "https://clientes.maxoil.info/modules/catalogos/catalogos.php",
    /** Número de cliente del portal. */
    username: "101006",
    /** Token del portal (32 caracteres). */
    password: "ZMJz9Ze30wk9qFjNY6a92LeGlqq8VAPD",
    /** Prefijo con el que Maxoil guarda los artículos WEGA (FAP-2219 → 0350FAP2219). */
    wegaCodePrefix: "0350",
    /** Descuento sobre "$ Lista" (tabla en pricing.ts). */
    discountPercent: requireDiscount("maxoil", "WEGA"),
    /**
     * Listas con el precio unitario de los artículos 0350. La general ya trae
     * motos, caja automática, tapas, racing, vasos, cabezales y saca filtros.
     */
    wegaPriceLists: [
      "lista_wega_general",
      "lista_wega_kits",
      "lista_wega_economicos",
    ],
    /** Mismos artículos de la general, con el precio por caja cerrada. */
    wegaClosedBoxPriceList: "lista_wega_caja_cerrada",
  },
} as const;

export type WegaProviderConfig = (typeof providers)["wega"];

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
