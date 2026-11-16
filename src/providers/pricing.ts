/**
 * Tabla comercial de listas / proveedores.
 * Acá se fijan descuento (lista → costo) y markup (costo → precio de venta).
 * No hay base de datos: para cambiar un valor, editá este archivo y redeploy.
 *
 * - `discountPercent`: se aplica en este servicio al armar `price`.
 * - `markupPercent`: fuente de verdad del markup; va en las respuestas de búsqueda
 *   para que el cotizador lo use (este servicio no multiplica el precio de venta).
 * - `stock` / `price`: si el proveedor nos devuelve esos datos (✓ en la tabla).
 * - `null` en % = no aplica o se gestiona en otro lado (ver `notes`).
 */
export type PricingRule = {
  id: string;
  provider: string;
  /** Marca o familia comercial, si aplica. */
  brand: string | null;
  /** Nombre de la lista en el proveedor, si hay varias. */
  list: string | null;
  /** true si el proveedor nos da stock / disponibilidad. */
  stock: boolean;
  /** true si el proveedor nos da precio. */
  price: boolean;
  discountPercent: number | null;
  markupPercent: number | null;
  /** Base sobre la que se aplica el descuento. */
  priceBase: "listPrice" | "providerPrice" | "netCost" | "none";
  notes: string;
};

export const pricingRules: PricingRule[] = [
  {
    id: "lubaires-mann",
    provider: "lubaires",
    brand: "MANN",
    list: null,
    stock: true,
    price: true,
    discountPercent: 30,
    markupPercent: 15,
    priceBase: "providerPrice",
    notes: "Descuento sobre el neto c/IVA que devuelve Lubaires. Markup definido acá para el cotizador.",
  },
  {
    id: "lubaires-wix",
    provider: "lubaires",
    brand: "WIX",
    list: null,
    stock: true,
    price: true,
    discountPercent: 30,
    markupPercent: 15,
    priceBase: "providerPrice",
    notes: "Mismo descuento/markup comercial que MANN en Lubaires.",
  },
  {
    id: "maxoil-wega",
    provider: "maxoil",
    brand: "WEGA",
    list: "lista_wega_general + kits + economicos",
    stock: true,
    price: true,
    discountPercent: 30,
    markupPercent: 15,
    priceBase: "listPrice",
    notes:
      "Descuento sobre \"$ Lista\" del portal. closedBoxPrice usa el mismo %. Markup definido acá para el cotizador.",
  },
  {
    id: "wega-excel",
    provider: "wega",
    brand: "WEGA",
    list: "lista Excel / Firestore price-listas-v2",
    stock: false,
    price: true,
    discountPercent: null,
    markupPercent: 15,
    priceBase: "listPrice",
    notes:
      "Sin stock. El descuento no está fijo acá: se setea al ingerir la Excel o desde Firestore (descuentoProveedor).",
  },
  {
    id: "goicoechea",
    provider: "goicoechea",
    brand: null,
    list: null,
    stock: true,
    price: true,
    discountPercent: 0,
    markupPercent: 15,
    priceBase: "netCost",
    notes: "El portal ya devuelve el Costo neto; no se aplica descuento extra. Markup definido acá.",
  },
  {
    id: "eagle",
    provider: "eagle",
    brand: null,
    list: null,
    stock: true,
    price: false,
    discountPercent: null,
    markupPercent: null,
    priceBase: "none",
    notes: "Solo stock de fábrica; no hay precio ni markup.",
  },
];

export type PricingCatalog = {
  rules: PricingRule[];
  /** Cómo se usan los campos. */
  legend: {
    stock: string;
    price: string;
    discountPercent: string;
    markupPercent: string;
  };
  error: string | null;
};

export function getPricingCatalog(): PricingCatalog {
  return {
    rules: pricingRules,
    legend: {
      stock: "true (✓) si el proveedor nos devuelve stock / disponibilidad.",
      price: "true (✓) si el proveedor nos devuelve precio.",
      discountPercent:
        "Porcentaje que este servicio resta sobre la base del proveedor para obtener el costo (`price`).",
      markupPercent:
        "Markup definido acá (fuente de verdad). Va en las respuestas de búsqueda; el cotizador lo aplica sobre el costo.",
    },
    error: null,
  };
}

function matchingRules(
  provider: string,
  brand?: string | null,
): PricingRule[] {
  return pricingRules.filter(
    (rule) =>
      rule.provider === provider &&
      (brand == null || rule.brand == null || rule.brand === brand),
  );
}

/** Descuento fijo de un proveedor (null si no hay regla o el % no está fijo en código). */
export function getFixedDiscountPercent(
  provider: string,
  brand?: string | null,
): number | null {
  const match = matchingRules(provider, brand).find((r) => r.discountPercent != null);
  return match?.discountPercent ?? null;
}

/** Markup definido acá para el cotizador (null si el proveedor no tiene precio). */
export function getFixedMarkupPercent(
  provider: string,
  brand?: string | null,
): number | null {
  const match = matchingRules(provider, brand).find((r) => r.markupPercent != null);
  return match?.markupPercent ?? null;
}
