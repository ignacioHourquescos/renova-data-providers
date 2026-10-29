import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSpecifications } from "../src/providers/fram/parseSpecifications.js";

const OIL_HTML = `
<html>
  <div class="result-list">
    <div class="result-item">
      <div class="cross-information">
        <div class="title">FILTRO DE ACEITE DE MOTOR: CH9973</div>
        <div class="first-description">
          <div class="description">WEGA: <b>WOE710</b></div>
        </div>
        <div class="second-description">
          <div class="description">TIPO: CARTUCHO</div>
          <div class="description">ALTURA: 69mm</div>
          <div class="description">DIÁMETRO INTERIOR: 24-24mm</div>
        </div>
      </div>
      <div class="modal-applications" id="modal-applications">
        <h4 class="title">Aplicaciones</h4>
        <ul>
          <li class="application">CITROEN C5 AIRCROSS 1.6 THP 156CV NAFTA 2020 a </li>
          <li class="application">CITROEN C3 PICASSO (13&#039;) 1.6 VTI NAFTA 2013 a 2016</li>
        </ul>
      </div>
    </div>
  </div>
</html>
`;

const AIR_HTML = `
<html>
  <div class="result-list">
    <div class="result-item">
      <div class="cross-information">
        <div class="title">FILTRO DE AIRE: CA11072</div>
        <div class="second-description">
          <div class="description">TIPO: PANEL</div>
          <div class="description">LARGO: 348mm</div>
          <div class="description">ALTURA: 57mm</div>
          <div class="description">ANCHO: 205mm</div>
        </div>
      </div>
      <div class="modal-applications" id="modal-applications">
        <ul>
          <li class="application">CITROEN BERLINGO FURGON 1.6 HDI DIESEL 2010 a </li>
        </ul>
      </div>
    </div>
  </div>
</html>
`;

describe("parseSpecifications FRAM", () => {
  it("lee nombre, dimensiones y aplicaciones de un cartucho", () => {
    const spec = parseSpecifications(OIL_HTML);
    assert.ok(spec);
    assert.equal(spec.framCode, "CH9973");
    assert.equal(spec.name, "FILTRO DE ACEITE DE MOTOR");
    assert.deepEqual(spec.dimensions, [
      { label: "TIPO", value: "CARTUCHO" },
      { label: "ALTURA", value: "69mm" },
      { label: "DIÁMETRO INTERIOR", value: "24-24mm" },
    ]);
    assert.deepEqual(spec.applications, [
      "CITROEN C5 AIRCROSS 1.6 THP 156CV NAFTA 2020 a",
      "CITROEN C3 PICASSO (13') 1.6 VTI NAFTA 2013 a 2016",
    ]);
  });

  it("acepta medidas de un filtro de aire", () => {
    const spec = parseSpecifications(AIR_HTML);
    assert.ok(spec);
    assert.equal(spec.framCode, "CA11072");
    assert.equal(spec.name, "FILTRO DE AIRE");
    assert.deepEqual(spec.dimensions, [
      { label: "TIPO", value: "PANEL" },
      { label: "LARGO", value: "348mm" },
      { label: "ALTURA", value: "57mm" },
      { label: "ANCHO", value: "205mm" },
    ]);
    assert.deepEqual(spec.applications, [
      "CITROEN BERLINGO FURGON 1.6 HDI DIESEL 2010 a",
    ]);
  });

  it("devuelve null sin result-item", () => {
    assert.equal(
      parseSpecifications("<html>No hay resultados</html>"),
      null,
    );
  });
});
