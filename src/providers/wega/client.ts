import { Agent, fetch as undiciFetch } from "undici";
import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";
import { parsePrintTable } from "./parseTable.js";
import { wegaProductSlug } from "./parseProduct.js";
import type { WegaModel } from "./types.js";

const config = providers.wega;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 30_000;

/** wega.com.ar tiene certificado inválido; sin esto el fetch falla. */
const permissiveDispatcher = new Agent({
  connect: { rejectUnauthorized: false },
});

function wegaFetch(url: string, init: Parameters<typeof undiciFetch>[1] = {}) {
  return undiciFetch(url, {
    ...init,
    dispatcher: permissiveDispatcher,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function cookieHeaderFrom(headers: {
  get(name: string): string | null;
  getSetCookie?: () => string[];
}): string {
  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter((v): v is string => Boolean(v));

  const pairs: string[] = [];
  for (const raw of setCookies) {
    const first = raw.split(";")[0]?.trim();
    if (first) pairs.push(first);
  }
  return pairs.join("; ");
}

function asModelList(data: unknown): WegaModel[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (item): item is WegaModel =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as WegaModel).label === "string",
  );
}

/** 1=autos, 2=utilitarios/camionetas, 3=pesados. */
export const WEGA_VEHICLE_TYPES = ["1", "2", "3"] as const;

async function fetchModelsForTipo(
  makeId: string,
  tipoVehiculo: string,
): Promise<WegaModel[]> {
  const url = `${config.baseUrl}/catalogo/modelos/ajax/listar/productos`;
  const res = await wegaFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": USER_AGENT,
      Accept: "*/*",
      Origin: config.origin,
      Referer: config.referer,
    },
    body: new URLSearchParams({ id: makeId, tv: tipoVehiculo }).toString(),
  });

  if (!res.ok) {
    throw new Error(`Wega models tv=${tipoVehiculo} HTTP ${res.status}`);
  }

  return asModelList(await res.json()).map((model) => ({
    ...model,
    tipoVehiculo: Number(tipoVehiculo),
  }));
}

export async function fetchModelsByMakeId(makeId: string): Promise<WegaModel[]> {
  logger.debug({ makeId }, "Calling Wega models");

  const lists = await Promise.all(
    WEGA_VEHICLE_TYPES.map(async (tv) => {
      try {
        return await fetchModelsForTipo(makeId, tv);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ makeId, tipoVehiculo: tv, err: message }, "Wega models tipo failed");
        return [];
      }
    }),
  );

  const merged = new Map<string, WegaModel>();
  for (const models of lists) {
    for (const model of models) {
      if (!model.label || merged.has(model.label)) continue;
      merged.set(model.label, model);
    }
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

async function fetchCatalogueWithTipo(
  make: string,
  model: string,
  tipoVehiculo: string,
) {
  const form = new URLSearchParams({
    "filtros_front_filter[tipo_vehiculo]": tipoVehiculo,
    "filtros_front_filter[marca]": make,
    "filtros_front_filter[modelo]": model,
    "filtros_front_filter[_referer]": config.referer,
  });

  logger.debug({ make, model, tipoVehiculo }, "Calling Wega catalogue");

  const postRes = await wegaFetch(`${config.baseUrl}/catalogo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    body: form.toString(),
    redirect: "manual",
  });

  if (postRes.status === 200) {
    const html = await postRes.text();
    return parsePrintTable(html);
  }

  const location = postRes.headers.get("location") || "/catalogo";
  const cookie = cookieHeaderFrom(postRes.headers);
  const getUrl = new URL(location, config.baseUrl).toString();

  const getRes = await wegaFetch(getUrl, {
    method: "GET",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      Referer: config.referer,
    },
  });

  if (!getRes.ok) {
    throw new Error(`Wega catalogue HTTP ${getRes.status}`);
  }

  const html = await getRes.text();
  return parsePrintTable(html);
}

function isMissingPrintTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("printTable");
}

export async function fetchCatalogue(
  make: string,
  model: string,
  tipoVehiculo?: string | number,
) {
  const preferred = tipoVehiculo != null ? String(tipoVehiculo) : null;
  const tipos = preferred
    ? [preferred, ...WEGA_VEHICLE_TYPES.filter((tv) => tv !== preferred)]
    : [...WEGA_VEHICLE_TYPES];

  let lastMissing: Error | null = null;

  for (const tv of tipos) {
    try {
      const data = await fetchCatalogueWithTipo(make, model, tv);
      logger.info(
        { make, model, tipoVehiculo: tv, rows: data.rows.length },
        "Wega catalogue table found",
      );
      return data;
    } catch (err) {
      if (!isMissingPrintTable(err)) throw err;
      lastMissing = err instanceof Error ? err : new Error(String(err));
      logger.info(
        { make, model, tipoVehiculo: tv },
        "Wega catalogue without printTable, trying next vehicle type",
      );
    }
  }

  throw lastMissing ?? new Error("No se encontró la tabla con id 'printTable'");
}

/** HTML de la ficha `/catalogo/filtros/detalle/{slug}`, o null si 404. */
export async function fetchProductHtml(code: string): Promise<string | null> {
  const slug = wegaProductSlug(code);
  if (!slug) return null;

  const url = `${config.baseUrl}/catalogo/filtros/detalle/${encodeURIComponent(slug)}`;
  logger.debug({ code, slug }, "Calling Wega product detail");

  const res = await wegaFetch(url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      Referer: config.referer,
    },
  });

  if (res.status === 404 || res.status === 500) return null;
  if (!res.ok) {
    throw new Error(`Wega product HTTP ${res.status}`);
  }

  return res.text();
}
