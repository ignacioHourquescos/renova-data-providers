import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deduceCost,
  isExactCodeMatch,
  mapAvailability,
  normalizeCode,
  parseProduct,
  toNumber,
} from "../src/providers/goicoechea/parse.js";
import type { GoicoecheaApiProduct } from "../src/providers/goicoechea/types.js";

describe("goicoechea parse", () => {
  it("parses Argentine money strings", () => {
    assert.equal(toNumber("$24.739,32"), 24739.32);
    assert.equal(toNumber("$34.360,16"), 34360.16);
    assert.equal(toNumber("24739.32"), 24739.32);
    assert.equal(toNumber(24739.32), 24739.32);
    assert.equal(toNumber("?"), null);
    assert.equal(toNumber(""), null);
  });

  it("normalizes codes like Lubaires", () => {
    assert.equal(normalizeCode("AL 12"), "AL12");
    assert.equal(normalizeCode("al-12"), "AL12");
    assert.equal(isExactCodeMatch("AL12", "al 12"), true);
    assert.equal(isExactCodeMatch("AL13", "AL12"), false);
  });

  it("uses PRICE_WITH_DISCOUNT_SHOW as net cost", () => {
    const product: GoicoecheaApiProduct = {
      prod_id: 123,
      prod_mscode: "AL12",
      prod_description: "FILTRO SECADOR AIRE",
      fam_name: "MAHLE",
      prod_listprice: "34360.16",
      PRICE_WITH_DISCOUNT: "25000",
      PRICE_WITH_DISCOUNT_SHOW: "24739.32",
    };

    assert.equal(deduceCost(product), 24739.32);

    const parsed = parseProduct(product);
    assert.equal(parsed.code, "AL12");
    assert.equal(parsed.brand, "MAHLE");
    assert.equal(parsed.price, 24739.32);
    assert.equal(parsed.listPrice, 34360.16);
    assert.equal(parsed.inStock, null);
    assert.equal(parsed.quantity, 1);
  });

  it("prefers promo price when present", () => {
    const product: GoicoecheaApiProduct = {
      PROMOPRICE: 20000,
      PRICE_WITH_DISCOUNT: 25000,
      PRICE_WITH_DISCOUNT_SHOW: 24739.32,
    };
    assert.equal(deduceCost(product), 20000);
  });

  it("maps availability state_id 1 as in stock", () => {
    const stock = mapAvailability(1, "DISPONEMOS DE STOCK");
    assert.equal(stock.inStock, true);
    assert.equal(stock.stockLabel, "DISPONEMOS DE STOCK");
  });

  it("maps availability state_id 3 as out of stock", () => {
    const stock = mapAvailability(3, "SIN STOCK");
    assert.equal(stock.inStock, false);
    assert.equal(stock.stockLabel, "SIN STOCK");
  });
});
