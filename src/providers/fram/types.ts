export type FramMake = {
  code: string;
  name: string;
};

export type FramModel = {
  id: string;
  label: string;
};

export type FramVersion = {
  id: string;
  label: string;
};

export type FramMakesResult = {
  makes: FramMake[];
  error: string | null;
};

export type FramModelsResult = {
  models: FramModel[];
  error: string | null;
};

export type FramVersionsResult = {
  versions: FramVersion[];
  error: string | null;
};

export type FramCatalogueResult = {
  headers: string[];
  rows: Record<string, string>[];
  error: string | null;
};

export type FramEquivalencia = {
  brand: string;
  code: string;
};

export type FramResolvedProduct = {
  framCode: string;
  wegaCode: string | null;
  imageUrl: string | null;
  equivalencias: FramEquivalencia[];
};

export type FramResolveResult = {
  items: Record<string, FramResolvedProduct>;
  error: string | null;
};
