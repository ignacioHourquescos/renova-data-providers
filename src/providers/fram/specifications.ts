import { logger } from "../../lib/logger.js";
import { LruCache } from "../../lib/lruCache.js";
import { fetchProductHtml } from "./client.js";
import { normalizeFramCode } from "./parseProduct.js";
import { emptySpecification, parseSpecifications } from "./parseSpecifications.js";
import type { FramSpecification, FramSpecificationsResult } from "./types.js";

const CACHE_MAX = 2_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 4;
const MAX_CODES = 60;

const cache = new LruCache<FramSpecification>(CACHE_MAX, CACHE_TTL_MS);
const inflight = new Map<string, Promise<FramSpecification>>();

export async function getSpecifications(
  codes: string[],
): Promise<FramSpecificationsResult> {
  const requested = uniqueCodes(codes).slice(0, MAX_CODES);
  const items: Record<string, FramSpecification> = {};

  if (!requested.length) {
    return { items, error: null };
  }

  try {
    const resolved = await mapInPool(requested, CONCURRENCY, loadOne);
    for (let i = 0; i < requested.length; i++) {
      const code = requested[i];
      const spec = resolved[i];
      if (code) items[code] = spec ?? emptySpecification(code);
    }
    logger.info(
      { count: requested.length, withDimensions: countWithDimensions(items) },
      "FRAM specifications OK",
    );
    return { items, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message, count: requested.length },
      "FRAM specifications error",
    );
    return { items, error: message };
  }
}

async function loadOne(code: string): Promise<FramSpecification> {
  const key = normalizeFramCode(code);
  if (!key) return emptySpecification(code);

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
): Promise<FramSpecification> {
  try {
    const html = await fetchProductHtml(code);
    const parsed = html ? parseSpecifications(html) : null;
    const spec = parsed ?? emptySpecification(code);
    cache.set(key, spec);
    return spec;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ code, err: message }, "FRAM specifications fetch failed");
    return emptySpecification(code);
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

function countWithDimensions(items: Record<string, FramSpecification>): number {
  return Object.values(items).filter((item) => item.dimensions.length).length;
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
