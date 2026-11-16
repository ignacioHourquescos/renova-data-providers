import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPriceIndex,
  extractCsrfToken,
  extractPriceListRows,
  isExactArticleMatch,
  mapStock,
  normalizeCode,
  parseListPrice,
  parseStockRow,
  toArticleCode,
  toPriceInfo,
} from "../src/providers/maxoil/parse.js";

const PREFIX = "0350";

describe("maxoil parse", () => {
  it("builds the Maxoil article code from a WEGA code", () => {
    assert.equal(normalizeCode("fap-2219"), "FAP2219");
    assert.equal(toArticleCode("FAP-2219", PREFIX), "0350FAP2219");
    assert.equal(toArticleCode("woE931", PREFIX), "0350WOE931");
    assert.equal(toArticleCode("JFO 0514", PREFIX), "0350JFO0514");
  });

  it("only accepts the exact article", () => {
    assert.equal(isExactArticleMatch("0350FAP2219", "fap-2219", PREFIX), true);
    assert.equal(isExactArticleMatch("0350FAP2219", "FAP-221", PREFIX), false);
    assert.equal(isExactArticleMatch("0410FAP2219", "FAP-2219", PREFIX), false);
    assert.equal(isExactArticleMatch(null, "FAP-2219", PREFIX), false);
  });

  it("maps the stock states of get_exact_basic", () => {
    assert.deepEqual(mapStock("en_stock", "En stock"), {
      inStock: true,
      stockLabel: "En stock",
      stockStatus: "en_stock",
    });
    assert.equal(mapStock("poco_stock", "Poco stock").inStock, true);
    assert.equal(mapStock("sin_stock", "Sin stock").inStock, false);
    assert.equal(mapStock("no_disponible", "No disponible").inStock, null);
    assert.equal(mapStock("otro_estado", "Consultar").inStock, null);
    assert.deepEqual(mapStock(null, null), {
      inStock: null,
      stockLabel: null,
      stockStatus: null,
    });
  });

  it("splits the WEGA code and the description from DES_ART", () => {
    const item = parseStockRow(
      {
        COD_ART: "0350FAP2219",
        DES_ART: "FAP-2219 - VW Fox / Suran /",
        STOCK_ESTADO: "en_stock",
        STOCK_BADGE: "En stock",
      },
      PREFIX,
      "WEGA",
    );

    assert.deepEqual(item, {
      code: "FAP-2219",
      name: "VW Fox / Suran /",
      brand: "WEGA",
      inStock: true,
      stockLabel: "En stock",
      stockStatus: "en_stock",
    });
  });

  it("keeps DES_ART whole when it does not start with the code", () => {
    const item = parseStockRow(
      {
        COD_ART: "0350WOE931",
        DES_ART: "FILTRO ACEITE - PORSCHE",
        STOCK_ESTADO: "sin_stock",
        STOCK_BADGE: "Sin stock",
      },
      PREFIX,
      "WEGA",
    );

    assert.equal(item.code, "WOE931");
    assert.equal(item.name, "FILTRO ACEITE - PORSCHE");
    assert.equal(item.inStock, false);
  });

  it("reads the csrf token from the login page", () => {
    const html = `<head><meta charset="UTF-8">
<meta name="csrf-token" content="35b4d1bd6d14384174024a3868bdca9e4e34b479a7127a67b2be07f8f96c5ce7">
<meta name="theme-color" content="#0f766e"></head>`;

    assert.equal(
      extractCsrfToken(html),
      "35b4d1bd6d14384174024a3868bdca9e4e34b479a7127a67b2be07f8f96c5ce7",
    );
    assert.equal(extractCsrfToken("<html></html>"), null);
  });
});

describe("maxoil price lists", () => {
  it("parses the list price format of the portal", () => {
    assert.equal(parseListPrice("$7.773"), 7773);
    assert.equal(parseListPrice("$173.496"), 173496);
    assert.equal(parseListPrice("$1.234,50"), 1234.5);
    assert.equal(parseListPrice(""), null);
    assert.equal(parseListPrice("Consultar"), null);
    assert.equal(parseListPrice(null), null);
  });

  it("reads the rows embedded in the price list page, skipping sections", () => {
    const html = `<main>
<script type="application/json" id="appBadgesInitialPayload">{"cart_count":0}</script>
<script type="application/json" id="priceListDynamicPayload">{"config":{"list_id":"lista_wega_general"},"items":[{"type":"section","title":"FILTROS DE AIRE PANEL","color":"#00A9D6"},{"type":"row","code":"0350FAP2219","alt":"FAP-2219 - VW Fox \\/ Suran \\/","cells":["FAP-2219","VW Fox \\/ Suran \\/ Saveiro 1.6","$7.773"],"detail_cells":[0]},{"type":"row","code":"0350WO120","cells":["WO-120","FIAT Palio","$6.268"]}]}</script>
</main>`;

    assert.deepEqual(extractPriceListRows(html), [
      { code: "0350FAP2219", price: "$7.773" },
      { code: "0350WO120", price: "$6.268" },
    ]);
  });

  it("returns null when the page has no price list", () => {
    assert.equal(
      extractPriceListRows('<div class="msg">No tiene permiso para ver la lista solicitada.</div>'),
      null,
    );
    assert.equal(
      extractPriceListRows('<script id="priceListDynamicPayload">no es json</script>'),
      null,
    );
  });

  it("indexes unit prices and adds the closed box price", () => {
    const index = buildPriceIndex(
      [
        [
          { code: "0350FAP1001", price: "$4.776" },
          { code: "0350FAP2219", price: "$7.773" },
        ],
        [
          { code: "0350WKL1002", price: "$20.456" },
          { code: "0350FAP2219", price: "$1" },
        ],
      ],
      [{ code: "0350FAP1001", price: "$3.570" }],
    );

    assert.deepEqual(index.get("0350FAP1001"), {
      listPrice: 4776,
      closedBoxListPrice: 3570,
    });
    assert.deepEqual(index.get("0350FAP2219"), {
      listPrice: 7773,
      closedBoxListPrice: null,
    });
    assert.deepEqual(index.get("0350WKL1002"), {
      listPrice: 20456,
      closedBoxListPrice: null,
    });
  });

  it("applies the configured discount to both prices", () => {
    assert.deepEqual(toPriceInfo({ listPrice: 4776, closedBoxListPrice: 3570 }, 30, 15), {
      price: 3343.2,
      listPrice: 4776,
      discountPercent: 30,
      markupPercent: 15,
      closedBoxPrice: 2499,
    });
    assert.deepEqual(toPriceInfo({ listPrice: 10000, closedBoxListPrice: null }, 30, 15), {
      price: 7000,
      listPrice: 10000,
      discountPercent: 30,
      markupPercent: 15,
      closedBoxPrice: null,
    });
    assert.deepEqual(toPriceInfo(undefined, 30, 15), {
      price: null,
      listPrice: null,
      discountPercent: 30,
      markupPercent: 15,
      closedBoxPrice: null,
    });
  });
});
