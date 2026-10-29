import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import { extractFramImageUrl } from "./parseProduct.js";
import type { FramDimension, FramSpecification } from "./types.js";

export function emptySpecification(code: string): FramSpecification {
  return {
    framCode: String(code ?? "").trim() || code,
    name: null,
    imageUrl: null,
    dimensions: [],
    applications: [],
  };
}

export function parseSpecifications(
  html: string,
  baseUrl: string,
): FramSpecification | null {
  const $ = load(html);
  const item = $(".result-list .result-item").first();
  if (!item.length) return null;

  const title = cleanText(item.find(".cross-information .title").first().text());
  const colon = title.indexOf(":");
  const name = colon >= 0 ? title.slice(0, colon).trim() : "";
  const framCode = colon >= 0 ? title.slice(colon + 1).trim() : title;
  if (!framCode) return null;

  return {
    framCode,
    name: name || null,
    imageUrl: extractFramImageUrl(item, baseUrl),
    dimensions: extractDimensions($, item),
    applications: extractApplications($, item),
  };
}

function extractDimensions(
  $: CheerioAPI,
  item: Cheerio<Element>,
): FramDimension[] {
  const dimensions: FramDimension[] = [];

  item.find(".second-description .description").each((_, el) => {
    const text = cleanText($(el).text());
    const colon = text.indexOf(":");
    if (colon < 0) return;
    const label = text.slice(0, colon).trim();
    const value = text.slice(colon + 1).trim();
    if (!label || !value) return;
    dimensions.push({ label, value });
  });

  return dimensions;
}

function extractApplications(
  $: CheerioAPI,
  item: Cheerio<Element>,
): string[] {
  const applications: string[] = [];

  item.find("#modal-applications li.application").each((_, el) => {
    const text = cleanText($(el).text());
    if (!text) return;
    applications.push(text);
  });

  return applications;
}

function cleanText(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
