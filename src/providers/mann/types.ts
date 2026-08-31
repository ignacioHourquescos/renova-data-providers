export type MannMake = {
  id: string;
  name: string;
  zone: string;
  segmentId: string;
  categoryId: string;
};

export type MannModel = {
  id: string;
  label: string;
  date: string | null;
  brandId: string;
};

export type MannVersion = {
  id: string;
  label: string;
  engineCode: string | null;
  kw: string | null;
  hp: string | null;
  ccm: string | null;
  fuelType: string | null;
  manufacturedFrom: string | null;
  manufacturedTo: string | null;
};

export type MannCatalogueItem = {
  code: string;
  sku: string | null;
  type: string;
  urlKey: string | null;
  notes: string[];
  fitsFrom: string | null;
  fitsTo: string | null;
};

export type MannCatalogueFilter = {
  code: string;
  label: string;
  total: number;
};

export type MannMakesResult = {
  makes: MannMake[];
  error: string | null;
};

export type MannModelsResult = {
  models: MannModel[];
  error: string | null;
};

export type MannVersionsResult = {
  versions: MannVersion[];
  error: string | null;
};

export type MannCatalogueResult = {
  items: MannCatalogueItem[];
  filters: MannCatalogueFilter[];
  totalCount: number;
  error: string | null;
};

export type MannEquivalencia = {
  brand: string;
  code: string;
};

export type MannResolvedProduct = {
  mannCode: string;
  sku: string | null;
  imageUrl: string | null;
  framCodes: string[];
  wegaCodes: string[];
  equivalencias: MannEquivalencia[];
};

export type MannResolveResult = {
  items: Record<string, MannResolvedProduct>;
  error: string | null;
};
