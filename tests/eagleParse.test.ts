import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brandFromFields,
  isExactCodeMatch,
  normalizeCode,
  parseStockItem,
  stockAvailability,
} from "../src/providers/eagle/parse.js";

describe("eagle parse", () => {
  it("normalizes codes the same way Eagle searches", () => {
    assert.equal(normalizeCode("C-4880 A"), "c4880a");
    assert.equal(normalizeCode("c 4880 a"), "c4880a");
    assert.equal(isExactCodeMatch("C-4880 A", "c4880a"), true);
    assert.equal(isExactCodeMatch("C-4880", "C-4880 A"), false);
  });

  it("reads the brand from marca or from the warehouse column", () => {
    assert.equal(brandFromFields({ Marca: "FRAM", Almacen: "001" }), "FRAM");
    assert.equal(brandFromFields({ Almacen: "WEGA" }), "WEGA");
    assert.equal(brandFromFields({ Nota: "filtro" }), null);
  });

  it("hides quantities over 100 and still counts them as stock", () => {
    const item = parseStockItem(
      {
        sku: "A-1",
        description: "Filtro",
        quantity: null,
        quantityLabel: "Más de 100",
        fields: { Almacen: "MANN" },
      },
      1,
    );
    assert.equal(item.code, "A-1");
    assert.equal(item.brand, "MANN");
    assert.equal(item.inStock, true);
    assert.equal(item.stockLabel, "Más de 100");
    assert.equal(item.quantity, null);
  });

  it("does not confirm stock above 100 when the number is hidden", () => {
    assert.deepEqual(stockAvailability(null, "Más de 100", 101), {
      inStock: null,
      stockLabel: "Más de 100",
    });
  });

  it("compares a numeric quantity against the amount requested", () => {
    const item = parseStockItem(
      { sku: "B-2", description: "Pastilla", quantity: 4, fields: {} },
      10,
    );
    assert.equal(item.inStock, false);
    assert.equal(item.stockLabel, "4");
    assert.equal(item.requested, 10);
  });
});
