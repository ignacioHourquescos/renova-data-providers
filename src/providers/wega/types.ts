export type WegaMake = {
  code: string;
  name: string;
};

export type WegaModel = {
  id?: number;
  label: string;
  /** 1 auto, 2 utilitario/camioneta, 3 pesado (ids internos de Wega). */
  tipoVehiculo?: number;
};

export type WegaMakesResult = {
  makes: WegaMake[];
  error: string | null;
};

export type WegaModelsResult = {
  models: WegaModel[];
  error: string | null;
};

export type WegaCatalogueResult = {
  headers: string[];
  rows: Record<string, string>[];
  error: string | null;
};

export type WegaEquivalencia = {
  brand: string;
  code: string;
};

export type WegaResolvedProduct = {
  wegaCode: string;
  framCode: string | null;
  framCodes: string[];
  imageUrl: string | null;
  equivalencias: WegaEquivalencia[];
};

export type WegaResolveResult = {
  items: Record<string, WegaResolvedProduct>;
  error: string | null;
};
