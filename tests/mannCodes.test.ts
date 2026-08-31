import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  displayMannCode,
  isPlaceholderImage,
  normalizeMannCode,
  toMannSku,
} from "../src/providers/mann/codes.js";

describe("mann codes", () => {
  it("normalizes spaced and sku forms to the same key", () => {
    assert.equal(normalizeMannCode("C 27 030"), "C27030");
    assert.equal(normalizeMannCode("C27030_MANN-FILTER"), "C27030");
    assert.equal(normalizeMannCode("w 67/1"), "W67/1");
  });

  it("builds Magento sku", () => {
    assert.equal(toMannSku("C 27 030"), "C27030_MANN-FILTER");
    assert.equal(toMannSku("C27030_MANN-FILTER"), "C27030_MANN-FILTER");
    assert.equal(toMannSku("W67/1"), "W67/1_MANN-FILTER");
  });

  it("displays readable code from sku", () => {
    assert.equal(displayMannCode("C27030_MANN-FILTER"), "C27030");
    assert.equal(displayMannCode("LIFETIME-FILTER"), "LIFETIME-FILTER");
  });

  it("detects placeholder images", () => {
    assert.equal(
      isPlaceholderImage(
        "https://catalog.mann-hummel.com/static/version1/frontend/Magento/luma/en_GB/Magento_Catalog/images/product/placeholder/image.jpg",
      ),
      true,
    );
    assert.equal(
      isPlaceholderImage("https://cdn.example.com/filters/c27030.jpg"),
      false,
    );
  });
});
