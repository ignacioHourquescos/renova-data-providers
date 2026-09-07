import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";
import {
  BASE_HEADERS,
  clearSessionCookie,
  getSessionCookie,
  parseJsonBody,
} from "./auth.js";
import { mapAvailability, parseProduct, productIdOf } from "./parse.js";
import type {
  GoicoecheaApiProduct,
  GoicoecheaArticle,
  GoicoecheaAvailabilityResponse,
  GoicoecheaSearchResponse,
} from "./types.js";

const config = providers.goicoechea;
const DEFAULT_QTY = 1;
const REQUEST_TIMEOUT_MS = 30_000;

export async function searchProducts(query: string): Promise<GoicoecheaApiProduct[]> {
  const body = new URLSearchParams({
    text_products: query,
    all_words: "1",
  });

  logger.debug({ query }, "Calling Goicoechea searcherTextProducts");

  const data = await postForm<GoicoecheaSearchResponse>(
    "/account/products/searcherTextProducts",
    body,
    "search",
  );

  if (!Array.isArray(data.list)) {
    throw new Error("Goicoechea search: respuesta inválida (se esperaba list[])");
  }

  return data.list;
}

export async function getOneProduct(
  mscode: string,
  quantity = DEFAULT_QTY,
): Promise<GoicoecheaApiProduct | null> {
  const body = new URLSearchParams({
    prod_mscode: mscode,
    amount: String(quantity),
  });

  try {
    const data = await postForm<{ data?: GoicoecheaApiProduct | null; error?: unknown }>(
      "/account/products/getOneProduct",
      body,
      "getOneProduct",
    );
    if (!data.data || typeof data.data !== "object") return null;
    return data.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ mscode, err: message }, "Goicoechea getOneProduct failed");
    return null;
  }
}

export async function withAvailability(
  raw: GoicoecheaApiProduct,
  quantity = DEFAULT_QTY,
): Promise<GoicoecheaArticle> {
  const item = { ...parseProduct(raw), quantity };
  const prodId = productIdOf(raw);
  if (!prodId) {
    return item;
  }

  try {
    const availability = await getAvailability(prodId, quantity);
    if (availability.error || !availability.data) {
      return item;
    }
    const mapped = mapAvailability(
      availability.data.state_id,
      availability.data.description,
    );
    return {
      ...item,
      inStock: mapped.inStock,
      stockLabel: mapped.stockLabel,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { prodId, code: item.code, err: message },
      "Goicoechea availability failed",
    );
    return item;
  }
}

async function getAvailability(
  prodId: string,
  amount: number,
): Promise<GoicoecheaAvailabilityResponse> {
  return postForm<GoicoecheaAvailabilityResponse>(
    `/account/products/getProductAvaibility/${encodeURIComponent(prodId)}/${amount}`,
    new URLSearchParams(),
    "availability",
  );
}

async function postForm<T>(
  path: string,
  body: URLSearchParams,
  label: string,
): Promise<T> {
  let cookie = await getSessionCookie();
  let response = await send(path, body, cookie);
  let text = await response.text();

  if (isAuthFailure(response) || isSessionHtml(text)) {
    logger.warn({ path, status: response.status }, "Goicoechea session expired, re-login");
    clearSessionCookie();
    cookie = await getSessionCookie(true);
    response = await send(path, body, cookie);
    text = await response.text();
  }

  if (!response.ok) {
    throw new Error(
      `Goicoechea ${label} HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`,
    );
  }

  return parseJsonBody<T>(text, label);
}

function isSessionHtml(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed.startsWith("<")) return false;
  return /iniciar sesi[oó]n|account\/log\/login|name="user"/i.test(trimmed);
}

function send(
  path: string,
  body: URLSearchParams,
  cookie: string,
): Promise<Response> {
  const encoded = body.toString();
  return fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      Cookie: cookie,
      ...(encoded
        ? { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }
        : {}),
    },
    body: encoded || undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function isAuthFailure(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}
