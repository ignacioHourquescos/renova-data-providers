export type LubairesArticle = {
  code: string | null;
  name: string | null;
  brand: string | null;
  /** Precio final con descuento del proveedor aplicado */
  price: number | null;
  /** Precio neto c/IVA tal como lo devolvió Lubaires (antes del descuento) */
  providerPrice: number | null;
  /** Precio de lista */
  listPrice: number | null;
  /** Precio público sugerido */
  publicPrice: number | null;
  /** Descuento % aplicado por nosotros sobre providerPrice */
  discountPercent: number;
  stockLabel: string | null;
  stockStatus: string | null;
  isOffer: boolean;
};

export type LubairesSearchResult = {
  items: LubairesArticle[];
  error: string | null;
};

export type LubairesApiArticle = {
  id?: string;
  supplier_code?: string | null;
  name?: string | null;
  description?: string | null;
  titleToShow?: string | null;
  descriptionToShow?: string | null;
  brand?: { name?: string | null } | null;
  price?: number | string | null;
  listPrice?: number | string | null;
  priceToShow?: number | string | null;
  finalPrice?: number | string | null;
  netPricePaymentConditionIva?: number | string | null;
  suggestedPrice?: number | string | null;
  isOffer?: boolean;
  available?: {
    label?: string | null;
    status?: string | null;
  } | null;
};
