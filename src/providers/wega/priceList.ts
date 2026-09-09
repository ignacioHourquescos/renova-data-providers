import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { applyDiscount } from "../config.js";
import { logger } from "../../lib/logger.js";
import { fetchWegaLatestFromFirestore } from "./firestoreSync.js";
import { normalizeWegaCode } from "./parseProduct.js";

export type WegaPriceArticle = {
  code: string;
  brand: "WEGA";
  price: number;
  listPrice: number;
  discountPercent: number;
};

export type WegaPriceSearchResult = {
  items: WegaPriceArticle[];
  error: string | null;
};

export type WegaPriceIngestInput = {
  fileUrl?: string;
  codeColumn?: string;
  priceColumn?: string;
  discountPercent: number;
  monthKey?: string;
};

export type WegaPriceIngestResult = {
  rowCount: number;
  monthKey: string | null;
  discountPercent: number;
  error: string | null;
};

export type ParsedPriceRow = {
  code: string;
  listPrice: number;
};

type StoredList = {
  fileUrl: string;
  codeColumn: string;
  priceColumn: string;
  monthKey: string;
  ingestedAt: string;
  /** código normalizado → precio de lista + código original */
  prices: Record<string, ParsedPriceRow>;
};

type PriceListStore = {
  version: 2;
  discountPercent: number;
  lists: Record<string, StoredList>;
};

/** Formato viejo: una sola lista. Se migra al levantar el JSON. */
type LegacyCachedList = {
  fileUrl?: string;
  codeColumn?: string;
  priceColumn?: string;
  discountPercent?: number;
  monthKey?: string | null;
  prices: Record<string, ParsedPriceRow>;
};

const MONTH_INDEX: Record<string, number> = {
  ENERO: 1,
  ENE: 1,
  FEBRERO: 2,
  FEB: 2,
  MARZO: 3,
  MAR: 3,
  ABRIL: 4,
  ABR: 4,
  MAYO: 5,
  MAY: 5,
  JUNIO: 6,
  JUN: 6,
  JULIO: 7,
  JUL: 7,
  AGOSTO: 8,
  AGO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  SEP: 9,
  SEPT: 9,
  OCTUBRE: 10,
  OCT: 10,
  NOVIEMBRE: 11,
  NOV: 11,
  DICIEMBRE: 12,
  DIC: 12,
};

const HEADER_SCAN_ROWS = 20;
const FETCH_TIMEOUT_MS = 45_000;
const NO_LIST_ERROR = "No hay lista WEGA cargada";

const persistPath = path.join(process.cwd(), "data", "wega-price-list.json");

let store: PriceListStore | null = null;
let restoreAttempted = false;
let lastFirestoreSyncAt = 0;
const FIRESTORE_SYNC_TTL_MS = 60_000;
let firestoreSyncInFlight: Promise<void> | null = null;

export function parseMonthKey(
  raw: string,
): { year: number | null; month: number } | null {
  const k = normalizeHeader(raw).replace(/[\s._/-]+/g, " ").trim();
  if (!k) return null;
  const iso = k.match(/^(\d{4}) (\d{1,2})$/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) return { year: Number(iso[1]), month };
  }
  const yearFirst = k.match(/^(\d{4}) ([A-Z]+)$/);
  if (yearFirst && MONTH_INDEX[yearFirst[2]]) {
    return { year: Number(yearFirst[1]), month: MONTH_INDEX[yearFirst[2]] };
  }
  const yearLast = k.match(/^([A-Z]+) (\d{4})$/);
  if (yearLast && MONTH_INDEX[yearLast[1]]) {
    return { year: Number(yearLast[2]), month: MONTH_INDEX[yearLast[1]] };
  }
  if (MONTH_INDEX[k]) return { year: null, month: MONTH_INDEX[k] };
  return null;
}

/** Entre MAYO y SEP / 2026-05 y 2026-09, gana el mes de calendario más nuevo. */
export function pickLatestMonthKey(
  keys: string[],
  now = new Date(),
): string | null {
  if (!keys.length) return null;
  const parsed = keys.map((key) => ({ key, parsed: parseMonthKey(key) }));
  const years = parsed
    .map((item) => item.parsed?.year)
    .filter((year): year is number => year != null);
  const fallbackYear = years.length ? Math.max(...years) : now.getFullYear();
  let best: { key: string; value: number } | null = null;
  for (const item of parsed) {
    const value = item.parsed
      ? (item.parsed.year ?? fallbackYear) * 100 + item.parsed.month
      : -1;
    if (!best || value > best.value) best = { key: item.key, value };
  }
  return best?.key ?? null;
}

export function pickLatestList(
  lists: Record<string, StoredList>,
): StoredList | null {
  const entries = Object.values(lists);
  if (!entries.length) return null;
  const latestKey = pickLatestMonthKey(entries.map((list) => list.monthKey));
  const candidates = latestKey
    ? entries.filter((list) => list.monthKey === latestKey)
    : entries;
  candidates.sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt));
  return candidates[0] ?? null;
}

export function parsePriceCell(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  let s = String(raw).trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function findHeaderRowIndex(
  rows: unknown[][],
  codeColumn: string,
  priceColumn: string,
): number {
  const codeKey = normalizeHeader(codeColumn);
  const priceKey = normalizeHeader(priceColumn);
  if (!codeKey || !priceKey) return -1;
  const max = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let i = 0; i < max; i++) {
    const headers = (rows[i] || []).map((cell) => normalizeHeader(cell));
    if (headers.includes(codeKey) && headers.includes(priceKey)) return i;
  }
  return -1;
}

function columnIndex(headers: unknown[], name: string): number {
  const key = normalizeHeader(name);
  return headers.findIndex((cell) => normalizeHeader(cell) === key);
}

export function parseSheetRows(
  rows: unknown[][],
  codeColumn: string,
  priceColumn: string,
): ParsedPriceRow[] {
  const headerIdx = findHeaderRowIndex(rows, codeColumn, priceColumn);
  if (headerIdx < 0) return [];
  const headers = rows[headerIdx] || [];
  const codeIdx = columnIndex(headers, codeColumn);
  const priceIdx = columnIndex(headers, priceColumn);
  if (codeIdx < 0 || priceIdx < 0) return [];

  const out: ParsedPriceRow[] = [];
  const seen = new Set<string>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const rawCode = row[codeIdx];
    const code = String(rawCode ?? "").trim();
    const key = normalizeWegaCode(code);
    if (!key || seen.has(key)) continue;
    const listPrice = parsePriceCell(row[priceIdx]);
    if (listPrice == null || listPrice < 0) continue;
    seen.add(key);
    out.push({ code, listPrice });
  }
  return out;
}

export function parseWorkbookBuffer(
  buffer: Buffer | Uint8Array,
  codeColumn: string,
  priceColumn: string,
): Record<string, ParsedPriceRow> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const prices: Record<string, ParsedPriceRow> = {};
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
    }) as unknown[][];
    for (const row of parseSheetRows(rows, codeColumn, priceColumn)) {
      const key = normalizeWegaCode(row.code);
      // Primera hoja gana: Livianos/Pesados/Motos repiten códigos con otra
      // columna VIP y un PRECIO distinto (a veces más viejo).
      if (!prices[key]) prices[key] = row;
    }
  }
  return prices;
}

function emptyStore(discountPercent = 0): PriceListStore {
  return { version: 2, discountPercent, lists: {} };
}

function migrateLegacy(parsed: LegacyCachedList): PriceListStore | null {
  if (!parsed || typeof parsed.prices !== "object" || !parsed.prices) {
    return null;
  }
  const monthKey = String(parsed.monthKey ?? "").trim() || "legacy";
  return {
    version: 2,
    discountPercent: Number(parsed.discountPercent) || 0,
    lists: {
      [monthKey]: {
        fileUrl: String(parsed.fileUrl ?? ""),
        codeColumn: String(parsed.codeColumn ?? ""),
        priceColumn: String(parsed.priceColumn ?? ""),
        monthKey,
        ingestedAt: new Date(0).toISOString(),
        prices: parsed.prices,
      },
    },
  };
}

async function persist(next: PriceListStore): Promise<void> {
  await mkdir(path.dirname(persistPath), { recursive: true });
  await writeFile(persistPath, JSON.stringify(next), "utf8");
}

async function restoreFromDisk(): Promise<PriceListStore | null> {
  try {
    const raw = await readFile(persistPath, "utf8");
    const parsed = JSON.parse(raw) as PriceListStore | LegacyCachedList;
    if (
      parsed &&
      "version" in parsed &&
      parsed.version === 2 &&
      parsed.lists &&
      typeof parsed.lists === "object"
    ) {
      return parsed;
    }
    return migrateLegacy(parsed as LegacyCachedList);
  } catch {
    return null;
  }
}

async function ensureStore(): Promise<PriceListStore | null> {
  if (store) return store;
  if (restoreAttempted) return null;
  restoreAttempted = true;
  store = await restoreFromDisk();
  if (store) {
    const current = pickLatestList(store.lists);
    logger.info(
      {
        lists: Object.keys(store.lists),
        rowCount: current ? Object.keys(current.prices).length : 0,
        monthKey: current?.monthKey ?? null,
      },
      "Wega price list restored from disk",
    );
  }
  return store;
}

async function downloadFile(fileUrl: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(fileUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`No se pudo bajar la lista WEGA (${res.status})`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return Buffer.from(bytes);
  } finally {
    clearTimeout(timeout);
  }
}

export async function ingestPriceList(
  input: WegaPriceIngestInput,
): Promise<WegaPriceIngestResult> {
  const discountPercent = Number(input.discountPercent);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    const current = pickLatestList(store?.lists ?? {});
    return {
      rowCount: current ? Object.keys(current.prices).length : 0,
      monthKey: current?.monthKey ?? null,
      discountPercent: store?.discountPercent ?? 0,
      error: "discountPercent inválido (0–100)",
    };
  }

  const fileUrl = String(input.fileUrl ?? "").trim();
  if (!fileUrl) {
    const currentStore = await ensureStore();
    if (!currentStore || !pickLatestList(currentStore.lists)) {
      return {
        rowCount: 0,
        monthKey: null,
        discountPercent,
        error: NO_LIST_ERROR,
      };
    }
    store = { ...currentStore, discountPercent };
    await persist(store);
    const latest = pickLatestList(store.lists);
    logger.info({ discountPercent }, "Wega price list discount updated");
    return {
      rowCount: latest ? Object.keys(latest.prices).length : 0,
      monthKey: latest?.monthKey ?? null,
      discountPercent,
      error: null,
    };
  }

  const codeColumn = String(input.codeColumn ?? "").trim();
  const priceColumn = String(input.priceColumn ?? "").trim();
  if (!codeColumn || !priceColumn) {
    return {
      rowCount: 0,
      monthKey: null,
      discountPercent,
      error: "Faltan codeColumn y priceColumn",
    };
  }

  const buffer = await downloadFile(fileUrl);
  const prices = parseWorkbookBuffer(buffer, codeColumn, priceColumn);
  const rowCount = Object.keys(prices).length;
  if (!rowCount) {
    return {
      rowCount: 0,
      monthKey: input.monthKey?.trim() || null,
      discountPercent,
      error: "No se encontraron filas con esas columnas",
    };
  }

  const monthKey =
    String(input.monthKey ?? "").trim() ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const currentStore = (await ensureStore()) ?? emptyStore(discountPercent);
  store = {
    version: 2,
    discountPercent,
    lists: {
      ...currentStore.lists,
      [monthKey]: {
        fileUrl,
        codeColumn,
        priceColumn,
        monthKey,
        ingestedAt: new Date().toISOString(),
        prices,
      },
    },
  };
  restoreAttempted = true;
  await persist(store);
  logger.info(
    {
      rowCount,
      monthKey,
      lists: Object.keys(store.lists),
      activeMonthKey: pickLatestList(store.lists)?.monthKey,
      codeColumn,
      priceColumn,
    },
    "Wega price list ingested",
  );
  return {
    rowCount,
    monthKey,
    discountPercent,
    error: null,
  };
}

export async function syncWegaPriceListFromFirestore(
  force = false,
): Promise<void> {
  const now = Date.now();
  if (!force && now - lastFirestoreSyncAt < FIRESTORE_SYNC_TTL_MS) return;
  if (firestoreSyncInFlight) {
    await firestoreSyncInFlight;
    return;
  }
  firestoreSyncInFlight = (async () => {
    lastFirestoreSyncAt = Date.now();
    try {
      const remote = await fetchWegaLatestFromFirestore();
      if (!remote) return;
      await ensureStore();
      const current = pickLatestList(store?.lists ?? {});
      const sameFile =
        current?.fileUrl === remote.fileUrl && current?.monthKey === remote.monthKey;
      if (sameFile && store) {
        if (store.discountPercent !== remote.discountPercent) {
          store = { ...store, discountPercent: remote.discountPercent };
          await persist(store);
          logger.info(
            { discountPercent: remote.discountPercent, monthKey: remote.monthKey },
            "Wega discount synced from Firestore",
          );
        }
        return;
      }
      const result = await ingestPriceList(remote);
      if (result.error) {
        logger.warn(
          { err: result.error, monthKey: remote.monthKey },
          "Wega Firestore ingest failed",
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err: message }, "Wega Firestore sync failed");
    }
  })().finally(() => {
    firestoreSyncInFlight = null;
  });
  await firestoreSyncInFlight;
}

export async function lookupPrice(code: string): Promise<WegaPriceSearchResult> {
  const q = String(code ?? "").trim();
  if (!q) {
    return { items: [], error: "query vacío" };
  }
  await syncWegaPriceListFromFirestore();
  const currentStore = await ensureStore();
  const current = currentStore ? pickLatestList(currentStore.lists) : null;
  if (!currentStore || !current) {
    return { items: [], error: NO_LIST_ERROR };
  }
  const row = current.prices[normalizeWegaCode(q)];
  if (!row) {
    return { items: [], error: null };
  }
  const price = applyDiscount(row.listPrice, currentStore.discountPercent);
  if (price == null) {
    return { items: [], error: null };
  }
  return {
    items: [
      {
        code: row.code,
        brand: "WEGA",
        price,
        listPrice: row.listPrice,
        discountPercent: currentStore.discountPercent,
      },
    ],
    error: null,
  };
}

/** Solo tests: limpia cache en memoria (no borra el JSON). */
export function resetWegaPriceListCache(): void {
  store = null;
  restoreAttempted = true;
  lastFirestoreSyncAt = 0;
}
