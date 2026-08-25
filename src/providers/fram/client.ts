import { fetch as undiciFetch } from "undici";
import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";
import { parseResultList } from "./parseResults.js";
import type { FramModel, FramVersion } from "./types.js";

const config = providers.fram;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 45_000;

function framFetch(url: string, init: Parameters<typeof undiciFetch>[1] = {}) {
  return undiciFetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

type FramJson<T> = {
  code?: number;
  message?: string;
  result?: T;
};

async function fetchFramJson<T>(url: string): Promise<T[]> {
  const res = await framFetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json, text/javascript, */*",
      "User-Agent": USER_AGENT,
      Origin: config.origin,
      Referer: config.referer,
    },
  });

  if (!res.ok) {
    throw new Error(`FRAM HTTP ${res.status} (${url})`);
  }

  const data = (await res.json()) as FramJson<T>;
  if (!Array.isArray(data.result)) {
    throw new Error("FRAM response inválida (se esperaba result[])");
  }
  return data.result;
}

export async function fetchModelsByMake(make: string): Promise<FramModel[]> {
  const url = new URL("/json/vehicle/model/", config.baseUrl);
  url.searchParams.set("brand_id", make);

  logger.debug({ make }, "Calling FRAM models");

  const result = await fetchFramJson<{ model_master?: string }>(url.toString());
  const models = result
    .map((item) => (item.model_master ?? "").trim())
    .filter(Boolean)
    .map((label) => ({ id: label, label }));

  return models.sort((a, b) => a.label.localeCompare(b.label));
}

export async function fetchVersions(
  make: string,
  model: string,
): Promise<FramVersion[]> {
  // El sitio publica esta URL con un `}` literal (bug de su template Laravel).
  const url = new URL("/json/vehicle/version}/", config.baseUrl);
  url.searchParams.set("brand_id", make);
  url.searchParams.set("model_id", model);

  logger.debug({ make, model }, "Calling FRAM versions");

  const result = await fetchFramJson<{ version?: string; fuel?: string }>(
    url.toString(),
  );

  const versions: FramVersion[] = [];
  const seen = new Set<string>();
  for (const item of result) {
    const id = (item.version ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const fuel = (item.fuel ?? "").trim();
    versions.push({
      id,
      label: fuel ? `${id} ${fuel}` : id,
    });
  }

  return versions.sort((a, b) => a.label.localeCompare(b.label));
}

export async function fetchCatalogue(
  make: string,
  model: string,
  version: string,
) {
  const url = new URL("/resultado", config.baseUrl);
  url.searchParams.set("brand_id", make);
  url.searchParams.set("model_id", model);
  url.searchParams.set("version_id", version);
  url.searchParams.set("tipo", "vehiculo_sidebar");

  logger.debug({ make, model, version }, "Calling FRAM catalogue");

  const res = await framFetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": USER_AGENT,
      Referer: config.referer,
    },
  });

  if (!res.ok) {
    throw new Error(`FRAM catalogue HTTP ${res.status}`);
  }

  const html = await res.text();
  return parseResultList(html);
}

/** HTML de `/buscar/detalle_filtro/fram-{slug}`, o null si 404. */
export async function fetchProductHtml(code: string): Promise<string | null> {
  const slug = String(code ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  if (!slug) return null;

  const url = `${config.baseUrl}/buscar/detalle_filtro/fram-${encodeURIComponent(slug)}`;
  logger.debug({ code, slug }, "Calling FRAM product detail");

  const res = await framFetch(url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      Referer: config.referer,
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`FRAM product HTTP ${res.status}`);
  }

  return res.text();
}
