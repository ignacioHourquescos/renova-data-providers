import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseProductDetail,
  wegaProductSlug,
  normalizeWegaCode,
} from "../src/providers/wega/parseProduct.js";

const HTML = `
<html>
  <div class="owl-carousel wega-product-owl">
    <div class="wega-product-owl-item">
      <picture>
        <source srcset="/images/productos/ae28769_mbl.webp" data-imagetipo="mobile">
        <source srcset="/images/productos/ae28769_gd.webp" data-imagetipo="desktop">
        <img src="https://dummyimage.com/400X300/828282/fff" alt="FAP-2219">
      </picture>
    </div>
  </div>
  <div class="owl-carousel wega-product-owl-thumbs">
    <div class="wega-product-owl-thumbs-item">
      <picture>
        <source srcset="/images/productos/ae28769_th.webp" data-imagetipo="desktop">
      </picture>
    </div>
  </div>
  <h2 class="product-title">FAP-2219</h2>
  <div id="equivalencias">
    <div class="single-fact-wrap"><div class="details"><h2>FAP-2219</h2><p>WEGA</p></div></div>
    <div class="single-fact-wrap"><div class="details"><h2>CA 12104</h2><p>FRAM</p></div></div>
    <div class="single-fact-wrap"><div class="details"><h2>CA 9411</h2><p>FRAM</p></div></div>
    <div class="single-fact-wrap"><div class="details"><h2>C 21014</h2><p>MANN</p></div></div>
  </div>
</html>
`;

describe("parseProductDetail", () => {
  it("maps WEGA code to FRAM and desktop image", () => {
    const product = parseProductDetail(HTML, "https://wega.com.ar");
    assert.ok(product);
    assert.equal(product.wegaCode, "FAP-2219");
    assert.equal(product.framCode, "CA 12104");
    assert.deepEqual(product.framCodes, ["CA 12104", "CA 9411"]);
    assert.equal(
      product.imageUrl,
      "https://wega.com.ar/images/productos/ae28769_gd.webp",
    );
    assert.equal(product.equivalencias.length, 4);
  });

  it("returns null without a product title", () => {
    assert.equal(parseProductDetail("<html></html>", "https://wega.com.ar"), null);
  });
});

describe("wega product codes", () => {
  it("builds the detalle slug", () => {
    assert.equal(wegaProductSlug("FAP-2219"), "fap-2219");
    assert.equal(wegaProductSlug(" WO 110 "), "wo-110");
  });

  it("normalizes cache keys", () => {
    assert.equal(normalizeWegaCode("FAP-2219"), "FAP2219");
    assert.equal(normalizeWegaCode("fap 2219"), "FAP2219");
  });
});
