import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";
import {
  USER_AGENT,
  getClientCode,
  getSession,
  parseJsonBody,
  renewSession,
  type MaxoilSession,
} from "./auth.js";
import { extractPriceListRows } from "./parse.js";
import type {
  MaxoilApiStockRow,
  MaxoilPriceListRow,
  MaxoilStockResponse,
} from "./types.js";

const config = providers.maxoil;
const STOCK_PATH = "/modules/stock/api_stock.php";
const PRICE_LISTS_PATH = "/modules/listas_precios/listas_precios.php";
const REQUEST_TIMEOUT_MS = 20_000;
/** La lista general pesa cerca de 800 KB. */
const PRICE_LIST_TIMEOUT_MS = 45_000;

/**
 * Stock de un artículo por su código completo de Maxoil (ej. 0350FAP2219).
 * `get_exact_basic` devuelve solo el estado, sin cantidad.
 */
export async function fetchExactStock(
  articleCode: string,
): Promise<MaxoilApiStockRow[]> {
  logger.debug({ articleCode }, "Calling Maxoil api_stock");

  const { response, text } = await requestWithSession(STOCK_PATH, (session) => ({
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Referer: config.referer,
      "X-CSRF-Token": session.csrfToken,
    },
    body: JSON.stringify({ action: "get_exact_basic", q: articleCode, limit: 1 }),
    timeoutMs: REQUEST_TIMEOUT_MS,
  }));

  const data = parseJsonBody<MaxoilStockResponse>(text, "stock");
  if (!response.ok || data.success !== true) {
    throw new Error(`Maxoil stock: ${data.error?.trim() || `HTTP ${response.status}`}`);
  }
  if (!Array.isArray(data.results)) {
    throw new Error("Maxoil stock: respuesta inválida (se esperaba results[])");
  }
  return data.results;
}

/**
 * Artículos y precios de una lista (ej. lista_wega_general). El portal no tiene
 * consulta de precio por código: la lista entera viene embebida en la página.
 */
export async function fetchPriceListRows(listId: string): Promise<MaxoilPriceListRow[]> {
  logger.debug({ listId }, "Calling Maxoil listas_precios");

  const form = new URLSearchParams({
    context_mode: "cliente",
    cod_cliente: getClientCode(),
    list_key: `dinamica:${listId}`,
  }).toString();

  const { response, text } = await requestWithSession(PRICE_LISTS_PATH, () => ({
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${config.baseUrl}${PRICE_LISTS_PATH}`,
    },
    body: form,
    timeoutMs: PRICE_LIST_TIMEOUT_MS,
  }));

  if (!response.ok) {
    throw new Error(`Maxoil lista ${listId}: HTTP ${response.status}`);
  }
  const rows = extractPriceListRows(text);
  if (!rows) {
    throw new Error(`Maxoil lista ${listId}: la página no trae la lista`);
  }
  return rows;
}

type RequestSpec = {
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
};

/** POST con la sesión guardada; si el portal la rechaza, renueva la sesión y reintenta una vez. */
async function requestWithSession(
  path: string,
  build: (session: MaxoilSession) => RequestSpec,
): Promise<{ response: Response; text: string }> {
  let session = await getSession();
  let response = await send(path, build(session), session);
  let text = await response.text();

  if (isAuthFailure(response, text)) {
    logger.warn({ path, status: response.status }, "Maxoil session expired, re-login");
    session = await renewSession(session);
    response = await send(path, build(session), session);
    text = await response.text();
  }

  return { response, text };
}

function send(path: string, spec: RequestSpec, session: MaxoilSession): Promise<Response> {
  return fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...spec.headers,
      Cookie: session.cookie,
      Origin: config.origin,
      "User-Agent": USER_AGENT,
    },
    body: spec.body,
    // Sin sesión las páginas redirigen al login: hay que ver el 302, no seguirlo.
    redirect: "manual",
    signal: AbortSignal.timeout(spec.timeoutMs),
  });
}

/**
 * Sin sesión la API responde 401 SESSION_EXPIRED y las páginas redirigen al login.
 * Con un token que no es el de la sesión responde 403 CSRF_INVALID.
 */
function isAuthFailure(response: Response, body: string): boolean {
  if (response.status === 401) return true;
  if (response.status >= 300 && response.status < 400) return true;
  return response.status === 403 && body.includes("CSRF_INVALID");
}
