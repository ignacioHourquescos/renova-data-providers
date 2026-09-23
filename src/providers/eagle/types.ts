export type EagleApiItem = {
  sku: string;
  description?: string | null;
  quantity?: number | null;
  quantityLabel?: string | null;
  fields?: Record<string, string> | null;
};

export type EagleArticle = {
  code: string;
  name: string | null;
  brand: string | null;
  /** Stock publicado por Eagle. null si está oculto («Más de 100») o no vino. */
  quantity: number | null;
  quantityLabel: string | null;
  /** Cantidad pedida al evaluar `inStock`. */
  requested: number;
  /** null cuando el stock está oculto y no se sabe si alcanza `requested`. */
  inStock: boolean | null;
  stockLabel: string;
  fields: Record<string, string>;
};

export type EagleSearchResult = {
  items: EagleArticle[];
  updatedAt: string | null;
  error: string | null;
};
