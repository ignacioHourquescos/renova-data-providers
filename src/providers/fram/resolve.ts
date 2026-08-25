import { logger } from "../../lib/logger.js";
import { LruCache } from "../../lib/lruCache.js";
import { providers } from "../config.js";
import { fetchProductHtml } from "./client.js";
import {
  emptyResolvedProduct,
  normalizeFramCode,
  parseProductDetail,
} from "./parseProduct.js";
import type { FramResolveResult, FramResolvedProduct } from "./types.js";

const CACHE_MAX = 2_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 4;
const MAX_CODES = 60;

const cache = new LruCache<FramResolvedProduct>(CACHE_MAX, CACHE_TTL_MS);
const inflight = new Map<string, Promise<FramResolvedProduct>>();

export async function resolveProducts(
  codes: string[],
): Promise<FramResolveResult> {
  const requested = uniqueCodes(codes).slice(0, MAX_CODES);
  const items: Record<string, FramResolvedProduct> = {};

  if (!requested.length) {
    return { items, error: null };
  }

  try {
    const resolved = await mapInPool(requested, CONCURRENCY, resolveOne);
    for (let i = 0; i < requested.length; i++) {
      const code = requested[i];
      const product = resolved[i];
      if (code) items[code] = product ?? emptyResolvedProduct(code);
    }
    logger.info(
      { count: requested.length, withImage: countWithImage(items) },
      "FRAM resolve OK",
    );
    return { items, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, count: requested.length }, "FRAM resolve error");
    return { items, error: message };
  }
}

async function resolveOne(code: string): Promise<FramResolvedProduct> {
  const key = normalizeFramCode(code);
  if (!key) return emptyResolvedProduct(code);

  const cached = cache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = fetchAndCache(code, key).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

async function fetchAndCache(
  code: string,
  key: string,
): Promise<FramResolvedProduct> {
  try {
    const html = await fetchProductHtml(code);
    const parsed = html
      ? parseProductDetail(html, providers.fram.baseUrl)
      : null;
    const product = parsed ?? emptyResolvedProduct(code);
    cache.set(key, product);
    return product;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ code, err: message }, "FRAM product fetch failed");
    return emptyResolvedProduct(code);
  }
}

function uniqueCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of codes) {
    const code = String(raw ?? "").trim();
    if (!code) continue;
    const key = normalizeFramCode(code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(code);
  }
  return out;
}

function countWithImage(items: Record<string, FramResolvedProduct>): number {
  return Object.values(items).filter((item) => item.imageUrl).length;
}

async function mapInPool<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await mapper(item, index);
    }
  }

  const n = Math.min(Math.max(limit, 1), items.length);
  if (!n) return [];
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
