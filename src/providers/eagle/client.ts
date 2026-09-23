import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";
import type { EagleApiItem } from "./types.js";

const SEARCH_LIMIT = 200;

export type EagleStockPage = {
  updatedAt: string | null;
  total: number;
  items: EagleApiItem[];
};

function eagleSettings(): { baseUrl: string; apiKey: string } {
  const baseUrl = (env.EAGLE_BASE_URL || providers.eagle.baseUrl).replace(/\/$/, "");
  const apiKey = (env.EAGLE_API_KEY || providers.eagle.apiKey).trim();
  return { baseUrl, apiKey };
}

/** GET /api/v1/stock?q= — búsqueda ignorando separadores en código, descripción y extras. */
export async function searchStock(query: string): Promise<EagleStockPage> {
  const { baseUrl, apiKey } = eagleSettings();
  assertApiKey(apiKey);

  const url = new URL("/api/v1/stock", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(SEARCH_LIMIT));
  url.searchParams.set("offset", "0");

  logger.debug({ query }, "Calling Eagle stock search");
  const data = await eagleGet(url, apiKey);
  return parseSearchPage(data);
}

/**
 * GET /api/v1/stock/:sku — match exacto del código (sin distinguir mayúsculas).
 * null si Eagle responde 404.
 */
export async function findBySku(sku: string): Promise<{
  updatedAt: string | null;
  item: EagleApiItem;
} | null> {
  const { baseUrl, apiKey } = eagleSettings();
  assertApiKey(apiKey);

  const url = new URL(`/api/v1/stock/${encodeURIComponent(sku)}`, baseUrl);
  logger.debug({ sku }, "Calling Eagle stock by sku");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 404) return null;

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(errorMessage(response.status, data));
  }

  const item = isApiItem(record(data)?.item) ? (record(data)?.item as EagleApiItem) : null;
  if (!item) throw new Error("Eagle API response inválida (se esperaba item)");

  const updatedAt = record(data)?.updatedAt;
  return {
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
    item,
  };
}

async function eagleGet(url: URL, apiKey: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(errorMessage(response.status, data));
  }
  return data;
}

function parseSearchPage(data: unknown): EagleStockPage {
  const body = record(data);
  if (!body || !Array.isArray(body.items)) {
    throw new Error("Eagle API response inválida (se esperaba items)");
  }

  const items = body.items.filter(isApiItem);
  return {
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
    total: typeof body.total === "number" ? body.total : items.length,
    items,
  };
}

function isApiItem(value: unknown): value is EagleApiItem {
  return record(value) != null && typeof record(value)?.sku === "string";
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 300) };
  }
}

function errorMessage(status: number, data: unknown): string {
  const message = record(data)?.error;
  if (typeof message === "string" && message.trim()) {
    return `Eagle API HTTP ${status}: ${message.trim()}`;
  }
  return `Eagle API HTTP ${status}`;
}

function assertApiKey(apiKey: string): void {
  if (!apiKey) throw new Error("Eagle API key no configurada");
}
