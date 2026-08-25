import { load } from "cheerio";

export const CATALOGUE_HEADERS = [
  "Aplicacion",
  "Año",
  "Aire",
  "Aceite",
  "Combustible",
  "Habitaculo",
  "Otros",
];

function columnForCategory(category: string): string {
  const c = category.toUpperCase();
  if (c.includes("HABIT") || c.includes("CABINA")) return "Habitaculo";
  if (c.includes("ACEITE")) return "Aceite";
  if (c.includes("AIRE")) return "Aire";
  if (c.includes("COMBUST")) return "Combustible";
  return "Otros";
}

function extractYear(aplicacion: string): string {
  const range = aplicacion.match(/(\d{4})\s*a\s*(\d{4})/i);
  if (range) return `${range[1]} -> ${range[2]}`;
  const single = aplicacion.match(/\b(19|20)\d{2}\b/);
  return single ? single[0] : "";
}

export function parseResultList(html: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const $ = load(html);
  const rows: Record<string, string>[] = [];

  $(".result-list .result-item").each((_, el) => {
    const item = $(el);
    const aplicacion = item.find(".car-model").first().text().replace(/\s+/g, " ").trim();
    if (!aplicacion) return;

    const row: Record<string, string> = {
      Aplicacion: aplicacion,
      Año: extractYear(aplicacion),
      Aire: "",
      Aceite: "",
      Combustible: "",
      Habitaculo: "",
      Otros: "",
    };

    item.find("a.filter-info").each((_, linkEl) => {
      const code = $(linkEl).find(".code").text().replace(/\s+/g, " ").trim();
      const category = $(linkEl).find(".category").text().replace(/\s+/g, " ").trim();
      if (!code) return;
      const column = columnForCategory(category);
      row[column] = row[column] ? `${row[column]} ${code}` : code;
    });

    rows.push(row);
  });

  return { headers: [...CATALOGUE_HEADERS], rows };
}
