export type GoicoecheaArticle = {
  code: string | null;
  name: string | null;
  brand: string | null;
  /** Costo neto que muestra Goicoechea (sin descuento extra nuestro). */
  price: number | null;
  /** Precio de lista. */
  listPrice: number | null;
  /** true si hay stock suficiente para `quantity`. */
  inStock: boolean | null;
  stockLabel: string | null;
  /** Cantidad pedida al consultar stock. */
  quantity: number;
};

export type GoicoecheaSearchResult = {
  items: GoicoecheaArticle[];
  error: string | null;
};

export type GoicoecheaApiProduct = {
  prod_id?: number | string | null;
  prod_mscode?: string | null;
  prod_description?: string | null;
  fam_name?: string | null;
  lin_name?: string | null;
  prod_listprice?: number | string | null;
  PRICE_WITH_DISCOUNT?: number | string | null;
  PRICE_WITH_DISCOUNT_SHOW?: number | string | null;
  PROMOPRICE?: number | string | null;
  FINALPRICE?: number | string | null;
};

export type GoicoecheaLoginResponse = {
  success?: boolean;
  error?: string | null;
  invitedUser?: boolean;
  client?: unknown;
};

export type GoicoecheaSearchResponse = {
  list?: GoicoecheaApiProduct[];
  disabled?: boolean;
  msgAlert?: string;
};

export type GoicoecheaAvailabilityResponse = {
  error?: unknown;
  data?: {
    state_id?: number | string | null;
    description?: string | null;
  } | null;
};
