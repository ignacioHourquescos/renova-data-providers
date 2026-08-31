import { load, type CheerioAPI } from "cheerio";
import type { WegaEquivalencia, WegaResolvedProduct } from "./types.js";

const DUMMY_IMAGE = "dummyimage.com";

export function wegaProductSlug(code: string): string {
  return String(code ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function normalizeWegaCode(code: string): string {
  return String(code ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

export function emptyResolvedProduct(code: string): WegaResolvedProduct {
  return {
    wegaCode: String(code ?? "").trim() || code,
    framCode: null,
    framCodes: [],
    imageUrl: null,
    equivalencias: [],
  };
}

export function parseProductDetail(
  html: string,
  baseUrl: string,
): WegaResolvedProduct | null {
  const $ = load(html);
  const wegaCode = $("h2.product-title")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (!wegaCode) return null;

  const equivalencias = extractEquivalencias($);
  const framCodes = equivalencias
    .filter((item) => item.brand.replace(/\s+/g, "").toUpperCase() === "FRAM")
    .map((item) => item.code);

  return {
    wegaCode,
    framCode: framCodes[0] || null,
    framCodes,
    imageUrl: extractImageUrl($, baseUrl),
    equivalencias,
  };
}

function extractEquivalencias($: CheerioAPI): WegaEquivalencia[] {
  const items: WegaEquivalencia[] = [];
  const seen = new Set<string>();

  $("#equivalencias .single-fact-wrap").each((_, el) => {
    const wrap = $(el);
    const code = wrap.find("h2").first().text().replace(/\s+/g, " ").trim();
    const brand = wrap.find("p").first().text().replace(/\s+/g, " ").trim();
    if (!code || !brand) return;
    const key = `${brand.toUpperCase()}|${code.toUpperCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ brand, code });
  });

  return items;
}

function extractImageUrl($: CheerioAPI, baseUrl: string): string | null {
  const item = $(".wega-product-owl .wega-product-owl-item").first();
  const desktop = item.find("source[data-imagetipo='desktop']").first();
  const fromSrcset = firstSrcsetUrl(desktop.attr("srcset"));
  const fromImg = item.find("img").first().attr("src") || "";
  const raw = fromSrcset || fromImg;
  if (!raw || raw.includes(DUMMY_IMAGE)) return null;

  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

function firstSrcsetUrl(srcset: string | undefined): string {
  if (!srcset) return "";
  return srcset.trim().split(/\s+/)[0] || "";
}
