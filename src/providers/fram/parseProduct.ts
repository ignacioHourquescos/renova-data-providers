import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { FramEquivalencia, FramResolvedProduct } from "./types.js";

export function framProductSlug(code: string): string {
  return String(code ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function normalizeFramCode(code: string): string {
  return String(code ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

export function emptyResolvedProduct(code: string): FramResolvedProduct {
  return {
    framCode: String(code ?? "").trim() || code,
    wegaCode: null,
    imageUrl: null,
    equivalencias: [],
  };
}

export function parseProductDetail(
  html: string,
  baseUrl: string,
): FramResolvedProduct | null {
  const $ = load(html);
  const item = $(".result-list .result-item").first();
  if (!item.length) return null;

  const title = item.find(".title").first().text().replace(/\s+/g, " ").trim();
  const framCode = title.includes(":")
    ? title.slice(title.indexOf(":") + 1).trim()
    : title;
  if (!framCode) return null;

  const equivalencias = extractEquivalencias($, item);
  const wega = equivalencias.find(
    (entry) => entry.brand.replace(/\s+/g, "").toUpperCase() === "WEGA",
  );

  return {
    framCode,
    wegaCode: wega?.code || null,
    imageUrl: extractImageUrl(item, baseUrl),
    equivalencias,
  };
}

function extractEquivalencias(
  $: CheerioAPI,
  item: Cheerio<Element>,
): FramEquivalencia[] {
  const items: FramEquivalencia[] = [];
  const seen = new Set<string>();

  item.find(".first-description .description").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const idx = text.indexOf(":");
    if (idx < 0) return;
    const brand = text.slice(0, idx).trim();
    const code = text.slice(idx + 1).trim();
    if (!brand || !code) return;
    const key = `${brand.toUpperCase()}|${code.toUpperCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ brand, code });
  });

  return items;
}

function extractImageUrl(
  item: Cheerio<Element>,
  baseUrl: string,
): string | null {
  const raw = item.find(".cross-image img").first().attr("src") || "";
  if (!raw) return null;

  try {
    const abs = new URL(raw, baseUrl);
    const nested = abs.searchParams.get("url");
    if (abs.pathname.replace(/\/+$/, "") === "/img" && nested) return nested;
    return abs.toString();
  } catch {
    return null;
  }
}
