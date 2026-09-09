import { logger } from "../../lib/logger.js";
import { getAdminFirestore } from "../../lib/firebaseAdmin.js";

export const PRICE_LIST_COLLECTION = "price-listas-v2";

export type FirestorePriceListMonth = {
  fileUrl?: string;
  fileName?: string;
};

export type FirestorePriceListRecord = {
  marca?: string;
  codeColumn?: string;
  priceColumn?: string;
  descuentoProveedor?: string | number;
  months?: Record<string, FirestorePriceListMonth>;
};

export type RemoteWegaList = {
  fileUrl: string;
  codeColumn: string;
  priceColumn: string;
  discountPercent: number;
  monthKey: string;
};

export function isWegaPriceBrand(brand: unknown): boolean {
  const raw = String(brand || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return raw === "WEGA";
}

export function parseDiscountPercent(raw: unknown): number {
  const s = String(raw ?? "")
    .trim()
    .replace("%", "")
    .replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function isPriceListSpreadsheet(nameOrUrl = ""): boolean {
  const clean = String(nameOrUrl).split("?")[0];
  const ext = clean.includes(".") ? clean.split(".").pop()?.toLowerCase() : "";
  return ext === "xlsx" || ext === "xls" || ext === "csv";
}

/** Último mes con Excel/CSV (clave YYYY-MM), igual que Order Manager. */
export function getLatestSpreadsheetMonth(
  record: FirestorePriceListRecord,
): (FirestorePriceListMonth & { monthKey: string }) | null {
  const months = record.months || {};
  const keys = Object.keys(months)
    .filter((key) => {
      const entry = months[key];
      if (!entry?.fileUrl) return false;
      return isPriceListSpreadsheet(entry.fileName || entry.fileUrl);
    })
    .sort();
  const last = keys[keys.length - 1];
  if (!last) return null;
  return { monthKey: last, ...months[last] };
}

export function remoteListFromRecord(
  record: FirestorePriceListRecord,
): RemoteWegaList | null {
  const latest = getLatestSpreadsheetMonth(record);
  const fileUrl = String(latest?.fileUrl ?? "").trim();
  const codeColumn = String(record.codeColumn ?? "").trim();
  const priceColumn = String(record.priceColumn ?? "").trim();
  if (!latest || !fileUrl || !codeColumn || !priceColumn) return null;
  return {
    fileUrl,
    codeColumn,
    priceColumn,
    discountPercent: parseDiscountPercent(record.descuentoProveedor),
    monthKey: latest.monthKey,
  };
}

export async function fetchWegaLatestFromFirestore(): Promise<RemoteWegaList | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const snap = await db.collection(PRICE_LIST_COLLECTION).get();
  const remotes: RemoteWegaList[] = [];
  for (const doc of snap.docs) {
    const record = doc.data() as FirestorePriceListRecord;
    if (!isWegaPriceBrand(record.marca)) continue;
    const remote = remoteListFromRecord(record);
    if (remote) remotes.push(remote);
  }
  if (!remotes.length) {
    logger.warn("Firestore: no hay lista WEGA vigente en price-listas-v2");
    return null;
  }
  remotes.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const latest = remotes[remotes.length - 1] ?? null;
  if (latest) {
    logger.info(
      { monthKey: latest.monthKey, discountPercent: latest.discountPercent },
      "Firestore WEGA latest list",
    );
  }
  return latest;
}
