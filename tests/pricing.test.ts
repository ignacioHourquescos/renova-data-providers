import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { providers } from "../src/providers/config.js";
import {
  getFixedDiscountPercent,
  getFixedMarkupPercent,
  getPricingCatalog,
  pricingRules,
} from "../src/providers/pricing.js";

describe("pricing catalog", () => {
  it("exposes every commercial rule with stock and price flags", () => {
    const catalog = getPricingCatalog();
    assert.equal(catalog.error, null);
    assert.ok(catalog.rules.length >= 4);
    assert.equal(new Set(catalog.rules.map((r) => r.id)).size, catalog.rules.length);
    for (const rule of catalog.rules) {
      assert.equal(typeof rule.stock, "boolean");
      assert.equal(typeof rule.price, "boolean");
    }
  });

  it("marks stock/price according to what each provider returns", () => {
    const byId = Object.fromEntries(pricingRules.map((r) => [r.id, r]));
    assert.equal(byId["maxoil-wega"].stock, true);
    assert.equal(byId["maxoil-wega"].price, true);
    assert.equal(byId["wega-excel"].stock, false);
    assert.equal(byId["wega-excel"].price, true);
    assert.equal(byId.eagle.stock, true);
    assert.equal(byId.eagle.price, false);
  });

  it("keeps Lubaires and Maxoil discounts/markups in sync with config", () => {
    assert.equal(getFixedDiscountPercent("lubaires"), 30);
    assert.equal(getFixedDiscountPercent("maxoil", "WEGA"), 30);
    assert.equal(getFixedMarkupPercent("maxoil", "WEGA"), 15);
    assert.equal(getFixedMarkupPercent("lubaires"), 15);
    assert.equal(providers.lubaires.discountPercent, 30);
    assert.equal(providers.maxoil.discountPercent, 30);
  });

  it("leaves the Wega Excel discount unset (managed outside this table)", () => {
    const wega = pricingRules.find((r) => r.id === "wega-excel");
    assert.ok(wega);
    assert.equal(wega.discountPercent, null);
    assert.equal(wega.markupPercent, 15);
  });
});
