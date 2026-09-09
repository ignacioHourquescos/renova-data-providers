import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { applyDiscount } from "../src/providers/config.js";
import {
  getLatestSpreadsheetMonth,
  remoteListFromRecord,
} from "../src/providers/wega/firestoreSync.js";
import {
  findHeaderRowIndex,
  parseMonthKey,
  parsePriceCell,
  parseSheetRows,
  parseWorkbookBuffer,
  pickLatestMonthKey,
} from "../src/providers/wega/priceList.js";
import { normalizeWegaCode } from "../src/providers/wega/parseProduct.js";

describe("parsePriceCell", () => {
  it("keeps numeric cells", () => {
    assert.equal(parsePriceCell(15261.88), 15261.88);
  });

  it("parses AR format 15.261,88", () => {
    assert.equal(parsePriceCell("15.261,88"), 15261.88);
  });

  it("parses US format 15,261.88", () => {
    assert.equal(parsePriceCell("15,261.88"), 15261.88);
  });

  it("parses comma decimals", () => {
    assert.equal(parsePriceCell("8088,80"), 8088.8);
  });

  it("returns null for empty / junk", () => {
    assert.equal(parsePriceCell(""), null);
    assert.equal(parsePriceCell("PRECIO"), null);
    assert.equal(parsePriceCell(null), null);
  });
});

describe("parseSheetRows", () => {
  const rows = [
    ["Lista de Precios Mayo 2026"],
    [],
    ["FILTROS DE AIRE WEGA"],
    ["CODIGO", "PACK", "DESCRIPCION", "PRECIO"],
    ["FAP-0001", 1, "RENAULT Clio 1.8 RSi", 15261.88],
    ["FILTROS DE AIRE PANEL"],
    ["FAP-1001", 40, "Moto HONDA Biz 125", 8088.8],
    ["JFO 0514", 1, "Aceite", "24.652,00"],
  ];

  it("finds the header below title rows", () => {
    assert.equal(findHeaderRowIndex(rows, "CODIGO", "PRECIO"), 3);
  });

  it("skips section titles and indexes codes", () => {
    const parsed = parseSheetRows(rows, "CODIGO", "PRECIO");
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0]?.code, "FAP-0001");
    assert.equal(parsed[0]?.listPrice, 15261.88);
    assert.equal(parsed[2]?.code, "JFO 0514");
    assert.equal(parsed[2]?.listPrice, 24652);
  });

  it("matches accented column names", () => {
    const withAccent = [
      ["Código", "Precio"],
      ["FAP-0001", 10],
    ];
    const parsed = parseSheetRows(withAccent, "CODIGO", "PRECIO");
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.listPrice, 10);
  });
});

describe("parseWorkbookBuffer", () => {
  it("reads every sheet and normalizes codes", () => {
    const air = XLSX.utils.aoa_to_sheet([
      ["Lista"],
      ["CODIGO", "PRECIO"],
      ["FAP-0001", 15261.88],
    ]);
    const oil = XLSX.utils.aoa_to_sheet([
      ["CODIGO", "PACK", "PRECIO"],
      ["JFO0514", 1, 24652],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, air, "Aire");
    XLSX.utils.book_append_sheet(wb, oil, "Aceite");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const prices = parseWorkbookBuffer(buffer, "CODIGO", "PRECIO");
    assert.equal(prices[normalizeWegaCode("FAP-0001")]?.listPrice, 15261.88);
    assert.equal(prices[normalizeWegaCode("JFO 0514")]?.listPrice, 24652);
    assert.equal(applyDiscount(15261.88, 53), 7173.08);
  });

  it("keeps the first sheet when the same code appears later", () => {
    const mayo = XLSX.utils.aoa_to_sheet([
      ["CODIGO", "PACK", "DESCRIPCION", "PRECIO"],
      ["JFO-0514", 1, "Foton Tractor", 27299.16],
    ]);
    const pesados = XLSX.utils.aoa_to_sheet([
      ["CODIGO", "PACK", "DESCRIPCION", "VIP", "PRECIO"],
      ["JFO-0514", 1, "Foton Tractor", "", 21735],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, mayo, "Mayo");
    XLSX.utils.book_append_sheet(wb, pesados, "Pesados");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const prices = parseWorkbookBuffer(buffer, "CODIGO", "PRECIO");
    assert.equal(prices[normalizeWegaCode("JFO-0514")]?.listPrice, 27299.16);
  });
});

describe("pickLatestMonthKey", () => {
  it("prefers ISO September over May", () => {
    assert.equal(pickLatestMonthKey(["2026-05", "2026-09"]), "2026-09");
  });

  it("prefers SEP over MAYO when year is missing", () => {
    assert.equal(pickLatestMonthKey(["MAYO", "SEP"]), "SEP");
  });

  it("uses the year from the ISO key for bare month names", () => {
    assert.equal(pickLatestMonthKey(["2026-05", "SEP"]), "SEP");
  });

  it("parses month names", () => {
    assert.deepEqual(parseMonthKey("mayo"), { year: null, month: 5 });
    assert.deepEqual(parseMonthKey("2026-09"), { year: 2026, month: 9 });
    assert.deepEqual(parseMonthKey("septiembre 2026"), { year: 2026, month: 9 });
  });
});

describe("firestore latest WEGA list", () => {
  it("picks September over May from months map", () => {
    const latest = getLatestSpreadsheetMonth({
      marca: "WEGA",
      months: {
        "2026-05": {
          fileUrl: "https://example.com/mayo.xlsx",
          fileName: "mayo.xlsx",
        },
        "2026-09": {
          fileUrl: "https://example.com/sep.xlsx",
          fileName: "sep.xlsx",
        },
      },
    });
    assert.equal(latest?.monthKey, "2026-09");
    assert.equal(latest?.fileUrl, "https://example.com/sep.xlsx");
  });

  it("builds ingest payload from the latest month", () => {
    const remote = remoteListFromRecord({
      marca: "WEGA",
      codeColumn: "CODIGO",
      priceColumn: "PRECIO",
      descuentoProveedor: "53%",
      months: {
        "2026-05": {
          fileUrl: "https://example.com/mayo.xlsx",
          fileName: "mayo.xlsx",
        },
        "2026-09": {
          fileUrl: "https://example.com/sep.xlsx",
          fileName: "sep.xlsx",
        },
      },
    });
    assert.equal(remote?.monthKey, "2026-09");
    assert.equal(remote?.discountPercent, 53);
    assert.equal(remote?.fileUrl, "https://example.com/sep.xlsx");
  });
});
