import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  framProductSlug,
  parseProductDetail,
} from "../src/providers/fram/parseProduct.js";

const HTML = `
<html>
  <div class="result-list">
    <div class="result-item">
      <div class="cross-image">
        <img src="https://catalogofram.com.ar/img?url=https%3A%2F%2Fimages.example.com%2Fpart.JPG">
      </div>
      <div class="title">FILTRO DE AIRE: CA12104</div>
      <div class="first-description">
        <div class="description">FRAM: <b>CA 12104</b></div>
        <div class="description">WEGA: <b>FAP2219</b></div>
      </div>
    </div>
  </div>
</html>
`;

describe("parseProductDetail FRAM", () => {
  it("lee código, WEGA e imagen desempaquetada", () => {
    const product = parseProductDetail(HTML, "https://catalogofram.com.ar");
    assert.ok(product);
    assert.equal(product.framCode, "CA12104");
    assert.equal(product.wegaCode, "FAP2219");
    assert.equal(product.imageUrl, "https://images.example.com/part.JPG");
  });

  it("devuelve null sin result-item", () => {
    assert.equal(
      parseProductDetail("<html>No hay resultados</html>", "https://catalogofram.com.ar"),
      null,
    );
  });
});

describe("framProductSlug", () => {
  it("saca espacios y guiones", () => {
    assert.equal(framProductSlug("CA 12104"), "ca12104");
    assert.equal(framProductSlug("CA-12104"), "ca12104");
  });
});
