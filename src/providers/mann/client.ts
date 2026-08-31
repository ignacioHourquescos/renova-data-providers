import { fetch as undiciFetch } from "undici";
import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";
import {
  displayMannCode,
  emptyResolvedProduct,
  isPlaceholderImage,
  toMannSku,
} from "./codes.js";
import type {
  MannCatalogueFilter,
  MannCatalogueItem,
  MannEquivalencia,
  MannMake,
  MannModel,
  MannResolvedProduct,
  MannVersion,
} from "./types.js";

const config = providers.mann;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 45_000;

type GqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

async function mannGql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const params = new URLSearchParams({ query: query.trim() });
  if (variables) params.set("variables", JSON.stringify(variables));

  const url = `${config.graphqlUrl}?${params}`;
  const res = await undiciFetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      Origin: config.origin,
      Referer: config.referer,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await res.text();
  let json: GqlResponse<T>;
  try {
    json = JSON.parse(text) as GqlResponse<T>;
  } catch {
    throw new Error(`MANN GraphQL non-JSON HTTP ${res.status}`);
  }

  if (!res.ok) {
    const msg = json.errors?.[0]?.message ?? text.slice(0, 200);
    throw new Error(`MANN GraphQL HTTP ${res.status}: ${msg}`);
  }

  if (json.errors?.length && json.data == null) {
    throw new Error(json.errors[0]?.message ?? "MANN GraphQL error");
  }

  if (json.data == null) {
    throw new Error("MANN GraphQL sin data");
  }

  return json.data;
}

type BrandSuggestion = {
  vehicle_brand_id?: string | null;
  vehicle_brand_name?: string | null;
  vehicle_application_category_id?: string | null;
  vehicle_application_segment_id?: string | null;
  suggestion_zone?: string | null;
};

export async function fetchBrandSuggestions(search: string): Promise<MannMake[]> {
  const data = await mannGql<{
    brand_id_suggestion: { suggestions: BrandSuggestion[] | null } | null;
  }>(
    `query($search: String!) {
      brand_id_suggestion(search: $search) {
        suggestions {
          vehicle_brand_id
          vehicle_brand_name
          vehicle_application_category_id
          vehicle_application_segment_id
          suggestion_zone
        }
      }
    }`,
    { search },
  );

  const suggestions = data.brand_id_suggestion?.suggestions ?? [];
  const makes: MannMake[] = [];
  const seen = new Set<string>();

  for (const s of suggestions) {
    const id = String(s.vehicle_brand_id ?? "").trim();
    const name = String(s.vehicle_brand_name ?? "").trim();
    if (!id || !name) continue;
    const categoryId = String(s.vehicle_application_category_id ?? "").trim();
    const segmentId = String(s.vehicle_application_segment_id ?? "").trim();
    const zone = String(s.suggestion_zone ?? "").trim();
    const key = `${id}|${segmentId}|${categoryId}|${zone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    makes.push({ id, name, zone, segmentId, categoryId });
  }

  return makes;
}

type BrandModel = {
  model_series_id?: string | null;
  model_series_name?: string | null;
  model_series_date?: string | null;
  vehicle_brand_id?: string | null;
};

export async function fetchModelsByBrand(opts: {
  brandId: string;
  categoryId?: string;
  modelName?: string;
}): Promise<MannModel[]> {
  const data = await mannGql<{
    modelCollectionByBrandId: { models: BrandModel[] | null } | null;
  }>(
    `query(
      $vehicle_brand_id: String!
      $vehicle_category_id: String
      $model_name: String
      $pageSize: Int
      $currentPage: Int
    ) {
      modelCollectionByBrandId(
        vehicle_brand_id: $vehicle_brand_id
        vehicle_category_id: $vehicle_category_id
        model_name: $model_name
        pageSize: $pageSize
        currentPage: $currentPage
      ) {
        models {
          model_series_id
          model_series_name
          model_series_date
          vehicle_brand_id
        }
      }
    }`,
    {
      vehicle_brand_id: opts.brandId,
      vehicle_category_id: opts.categoryId || null,
      model_name: opts.modelName || null,
      pageSize: 200,
      currentPage: 1,
    },
  );

  const models = (data.modelCollectionByBrandId?.models ?? [])
    .map((m) => {
      const id = String(m.model_series_id ?? "").trim();
      const label = String(m.model_series_name ?? "").trim();
      if (!id || !label) return null;
      return {
        id,
        label,
        date: String(m.model_series_date ?? "").trim() || null,
        brandId: String(m.vehicle_brand_id ?? opts.brandId).trim(),
      } satisfies MannModel;
    })
    .filter((m): m is MannModel => m != null);

  return models.sort((a, b) => a.label.localeCompare(b.label));
}

type ModelType = {
  model_type_id?: string | null;
  vehicle_name?: string | null;
  engine_code?: string | null;
  kw?: string | null;
  bhp?: string | null;
  ccm?: string | null;
  fuel_type?: string | null;
  vehicle_manufactured_from?: string | null;
  vehicle_manufactured_to?: string | null;
};

function formatVersionLabel(t: ModelType): string {
  const name = String(t.vehicle_name ?? "").trim();
  const kw = String(t.kw ?? "").trim();
  const hp = String(t.bhp ?? "").trim();
  const engine = String(t.engine_code ?? "").trim();
  const ccm = String(t.ccm ?? "").trim();
  const from = yearFromDate(t.vehicle_manufactured_from);
  const to = yearFromDate(t.vehicle_manufactured_to);

  const power = [kw && `${kw} kw`, hp && `${hp} hp`].filter(Boolean).join(" - ");
  const engineBit = [engine, ccm && `${ccm} ccm`].filter(Boolean).join(" - ");
  const range =
    from && to && to !== "9999"
      ? `${from} -> ${to}`
      : from
        ? `${from} ->`
        : "";

  const parts = [
    name,
    power,
    engineBit && `(${engineBit}${range ? ` - ${range}` : ""})`,
  ].filter(Boolean);

  if (parts.length) return parts.join(" - ").replace(" - (", " (");
  return name || engine || "versión";
}

function yearFromDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("9999") || raw.startsWith("1900")) return null;
  const year = raw.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

export async function fetchVersionsBySeries(
  modelSeriesId: string,
): Promise<MannVersion[]> {
  const data = await mannGql<{
    modelTypeCollection: { allModelTypes: ModelType[] | null } | null;
  }>(
    `query($model_series_id: String) {
      modelTypeCollection(model_series_id: $model_series_id) {
        allModelTypes {
          model_type_id
          vehicle_name
          engine_code
          kw
          bhp
          ccm
          fuel_type
          vehicle_manufactured_from
          vehicle_manufactured_to
        }
      }
    }`,
    { model_series_id: modelSeriesId },
  );

  return (data.modelTypeCollection?.allModelTypes ?? [])
    .map((t) => {
      const id = String(t.model_type_id ?? "").trim();
      if (!id) return null;
      return {
        id,
        label: formatVersionLabel(t),
        engineCode: String(t.engine_code ?? "").trim() || null,
        kw: String(t.kw ?? "").trim() || null,
        hp: String(t.bhp ?? "").trim() || null,
        ccm: String(t.ccm ?? "").trim() || null,
        fuelType: String(t.fuel_type ?? "").trim() || null,
        manufacturedFrom: String(t.vehicle_manufactured_from ?? "").trim() || null,
        manufacturedTo: String(t.vehicle_manufactured_to ?? "").trim() || null,
      } satisfies MannVersion;
    })
    .filter((v): v is MannVersion => v != null);
}

type LinkageItem = {
  product_name?: string | null;
  product_type?: string | null;
  product?: {
    sku?: string | null;
    url_key?: string | null;
  } | null;
  linkages?: Array<{
    date_interval?: {
      linkage_fits_from?: string | null;
      linkage_fits_to?: string | null;
    } | null;
    text?: Array<{
      module_name?: string | null;
      module_value?: string | null;
    } | null> | null;
  } | null> | null;
};

type AvailableFilter = {
  code?: string | null;
  label?: string | null;
  total_products?: number | null;
};

export async function fetchCatalogueByType(opts: {
  modelTypeId: string;
  pageSize?: number;
  currentPage?: number;
}): Promise<{
  items: MannCatalogueItem[];
  filters: MannCatalogueFilter[];
  totalCount: number;
}> {
  const pageSize = opts.pageSize ?? 50;
  const currentPage = opts.currentPage ?? 1;

  const data = await mannGql<{
    productLinkageCollection: {
      total_count?: number | null;
      available_filters?: AvailableFilter[] | null;
      items?: LinkageItem[] | null;
    } | null;
  }>(
    `query(
      $vehicle_model_type_id: String
      $pageSize: Int
      $currentPage: Int
    ) {
      productLinkageCollection(
        vehicle_model_type_id: $vehicle_model_type_id
        pageSize: $pageSize
        currentPage: $currentPage
        filterBy: ALL_FILTER
      ) {
        total_count
        available_filters { code label total_products }
        items {
          product_name
          product_type
          product { sku url_key }
          linkages {
            date_interval { linkage_fits_from linkage_fits_to }
            text { module_name module_value }
          }
        }
      }
    }`,
    {
      vehicle_model_type_id: opts.modelTypeId,
      pageSize,
      currentPage,
    },
  );

  const collection = data.productLinkageCollection;
  const items: MannCatalogueItem[] = (collection?.items ?? []).map((item) => {
    const sku = item.product?.sku ?? null;
    const productName = String(item.product_name ?? "").trim();
    const code = displayMannCode(sku || productName);
    const linkage = item.linkages?.[0];
    const notes = (linkage?.text ?? [])
      .map((t) => {
        const name = String(t?.module_name ?? "").trim();
        const value = String(t?.module_value ?? "").trim();
        if (name && value) return `${name}: ${value}`;
        return name || value;
      })
      .filter(Boolean);

    return {
      code,
      sku,
      type: String(item.product_type ?? "").trim() || "Unknown",
      urlKey: item.product?.url_key ?? null,
      notes,
      fitsFrom: linkage?.date_interval?.linkage_fits_from ?? null,
      fitsTo: linkage?.date_interval?.linkage_fits_to ?? null,
    };
  });

  const filters: MannCatalogueFilter[] = (collection?.available_filters ?? [])
    .map((f) => ({
      code: String(f.code ?? "").trim(),
      label: String(f.label ?? "").trim(),
      total: Number(f.total_products ?? 0),
    }))
    .filter((f) => f.code);

  return {
    items,
    filters,
    totalCount: Number(collection?.total_count ?? items.length),
  };
}

type ProductItem = {
  sku?: string | null;
  name?: string | null;
  url_key?: string | null;
  image?: { url?: string | null } | null;
  small_image?: { url?: string | null } | null;
  thumbnail?: { url?: string | null } | null;
  comparison_numbers?: Array<{
    label?: string | null;
    value?: string[] | null;
  } | null> | null;
};

export async function fetchProductByCode(
  code: string,
): Promise<MannResolvedProduct> {
  const sku = toMannSku(code);
  if (!sku) return emptyResolvedProduct(code);

  logger.debug({ code, sku }, "Calling MANN product");

  const data = await mannGql<{
    products: { items: ProductItem[] | null; total_count?: number | null } | null;
  }>(
    `query($filter: ProductAttributeFilterInput) {
      products(filter: $filter, pageSize: 5) {
        total_count
        items {
          sku
          name
          url_key
          image { url }
          small_image { url }
          thumbnail { url }
          comparison_numbers { label value }
        }
      }
    }`,
    { filter: { sku: { eq: sku } } },
  );

  const product = data.products?.items?.[0];
  if (!product) return emptyResolvedProduct(code);

  const equivalencias: MannEquivalencia[] = [];
  const framCodes: string[] = [];
  const wegaCodes: string[] = [];

  for (const ref of product.comparison_numbers ?? []) {
    const brand = String(ref?.label ?? "").trim();
    if (!brand) continue;
    for (const value of ref?.value ?? []) {
      const refCode = String(value ?? "").trim();
      if (!refCode) continue;
      equivalencias.push({ brand, code: refCode });
      const brandKey = brand.toUpperCase();
      if (brandKey === "FRAM") framCodes.push(refCode);
      if (brandKey === "WEGA" || brandKey.startsWith("WEGA")) {
        wegaCodes.push(refCode);
      }
    }
  }

  const imageCandidates = [
    product.image?.url,
    product.small_image?.url,
    product.thumbnail?.url,
  ];
  const imageUrl =
    imageCandidates.find((url) => url && !isPlaceholderImage(url)) ?? null;

  return {
    mannCode: displayMannCode(product.sku || product.name || code),
    sku: product.sku ?? sku,
    imageUrl,
    framCodes,
    wegaCodes,
    equivalencias,
  };
}
