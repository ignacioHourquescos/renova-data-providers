import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { Element } from "domhandler";

const MAX_HEADERS = 11;

export function parsePrintTable(html: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const $ = load(html);
  const table = $("#printTable");

  if (!table.length) {
    throw new Error("No se encontró la tabla con id 'printTable'");
  }

  const headers = extractHeaders($, table);
  const rows = extractRows($, table, headers);

  return { headers, rows };
}

function extractHeaders(
  $: CheerioAPI,
  table: Cheerio<Element>,
): string[] {
  const headers: string[] = [];

  const theadFirstRow = table.find("thead tr").first();
  if (theadFirstRow.length > 0) {
    theadFirstRow.find("th").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text !== "---") {
        headers.push(text);
      }
    });
  }

  if (headers.length === 0) {
    const firstRowThs = table.find("tr").first().find("th");
    firstRowThs.each((_, el) => {
      const text = $(el).text().trim();
      if (text && text !== "---") {
        headers.push(text);
      }
    });
  }

  if (headers.length === 0) {
    const dataRows = table.find("tbody tr").length
      ? table.find("tbody tr")
      : table.find("tr").filter((_, el) => $(el).find("td").length > 0);

    const cellCounts: number[] = [];
    dataRows.each((_, rowEl) => {
      cellCounts.push($(rowEl).find("td").length);
    });

    const targetCols = cellCounts.length > 0 ? Math.min(...cellCounts) : 0;
    for (let i = 0; i < targetCols; i++) {
      headers.push(`Columna ${i + 1}`);
    }
  }

  if (headers.length > 15) {
    headers.splice(MAX_HEADERS);
  }

  return headers;
}

function extractRows(
  $: CheerioAPI,
  table: Cheerio<Element>,
  headers: string[],
): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const tbody = table.find("tbody");
  const rowEls = tbody.length > 0 ? tbody.find("tr") : table.find("tr");
  let skipFirstRow = false;

  if (tbody.length === 0) {
    const firstRow = rowEls.first();
    if (firstRow.find("th").length > 0) {
      skipFirstRow = true;
    }
  }

  rowEls.each((index, rowEl) => {
    if (skipFirstRow && index === 0) return;

    const cells = $(rowEl).find("td");
    if (cells.length === 0) return;

    const row: Record<string, string> = {};
    const maxCols = Math.min(cells.length, headers.length);

    for (let colIndex = 0; colIndex < maxCols; colIndex++) {
      const header = headers[colIndex];
      if (!header) continue;
      row[header] = $(cells[colIndex])
        .text()
        .replace(/\s+/g, " ")
        .trim();
    }

    if (Object.values(row).some((val) => val.length > 0)) {
      rows.push(row);
    }
  });

  return rows;
}
