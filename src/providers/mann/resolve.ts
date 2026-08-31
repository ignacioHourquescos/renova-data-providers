import { logger } from "../../lib/logger.js";
import { LruCache } from "../../lib/lruCache.js";
import { fetchProductByCode } from "./client.js";
import { emptyResolvedProduct, normalizeMannCode } from "./codes.js";
import type { MannResolveResult, MannResolvedProduct } from "./types.js";

const CACHE_MAX = 2_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 4;
const MAX_CODES = 60;

const cache = new LruCache<MannResolvedProduct>(CACHE_MAX, CACHE_TTL_MS);
const inflight = new Map<string, Promise<MannResolvedProduct>>();

export async function resolveProducts(
  codes: string[],
): Promise<MannResolveResult> {
  const requested = uniqueCodes(codes).slice(0, MAX_CODES);
  const items: Record<string, MannResolvedProduct> = {};

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
      {
        count: requested.length,
        withFram: Object.values(items).filter((p) => p.framCodes.length).length,
      },
      "MANN resolve OK",
    );
    return { items, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, count: requested.length }, "MANN resolve error");
    return { items, error: message };
  }
}

async function resolveOne(code: string): Promise<MannResolvedProduct> {
  const key = normalizeMannCode(code);
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
): Promise<MannResolvedProduct> {
  try {
    const product = await fetchProductByCode(code);
    cache.set(key, product);
    return product;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ code, err: message }, "MANN product fetch failed");
    return emptyResolvedProduct(code);
  }
}

function uniqueCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of codes) {
    const code = String(raw ?? "").trim();
    if (!code) continue;
    const key = normalizeMannCode(code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(code);
  }
  return out;
}

async function mapInPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await fn(item);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
