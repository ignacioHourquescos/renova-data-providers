export type MaxoilStockInfo = {
  code: string | null;
  name: string | null;
  brand: string;
  /** true con stock, false sin stock, null si Maxoil no lo informa. */
  inStock: boolean | null;
  /** Texto que muestra el portal (ej. "En stock"). */
  stockLabel: string | null;
  /** Estado tal cual lo devuelve Maxoil: en_stock, poco_stock, sin_stock o no_disponible. */
  stockStatus: string | null;
};

export type MaxoilPriceInfo = {
  /** Costo: `listPrice` menos `discountPercent`. null si el artículo no está en las listas. */
  price: number | null;
  /** "$ Lista" del portal. */
  listPrice: number | null;
  discountPercent: number;
  /** Markup definido en pricing.ts para el cotizador. */
  markupPercent: number;
  /** Costo comprando por caja cerrada. null si el artículo no tiene ese precio. */
  closedBoxPrice: number | null;
};

export type MaxoilArticle = MaxoilStockInfo & MaxoilPriceInfo;

export type MaxoilSearchResult = {
  items: MaxoilArticle[];
  /** Motivo por el que no se pudieron leer las listas de precios; el stock se devuelve igual. */
  priceError: string | null;
  error: string | null;
};

export type MaxoilApiStockRow = {
  COD_ART?: string | null;
  DES_ART?: string | null;
  STOCK_ESTADO?: string | null;
  STOCK_BADGE?: string | null;
};

/** Forma común de las respuestas JSON del portal, también cuando fallan. */
export type MaxoilApiResponse = {
  success?: boolean;
  error?: string | null;
  code?: string | null;
  csrf_token?: string | null;
};

export type MaxoilStockResponse = MaxoilApiResponse & {
  results?: MaxoilApiStockRow[];
};

/** Fila de una lista de precios: código de artículo de Maxoil y precio como texto ("$7.773"). */
export type MaxoilPriceListRow = {
  code: string;
  price: string;
};

export type MaxoilPriceEntry = {
  listPrice: number | null;
  closedBoxListPrice: number | null;
};

/** Precios por código de artículo de Maxoil (ej. 0350FAP2219). */
export type MaxoilPriceIndex = Map<string, MaxoilPriceEntry>;
