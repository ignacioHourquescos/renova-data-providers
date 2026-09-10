import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCuit, isValidCuit, normalizeCuit } from "../src/lib/cuit.js";
import { parseConstanciaHtml } from "../src/providers/afip/parse.js";

describe("cuit", () => {
  it("normalizes and formats", () => {
    assert.equal(normalizeCuit("30-71234315-6"), "30712343156");
    assert.equal(formatCuit("30712343156"), "30-71234315-6");
  });

  it("validates checksum", () => {
    assert.equal(isValidCuit("30712343156"), true);
    assert.equal(isValidCuit("30-71234315-6"), true);
    assert.equal(isValidCuit("30712343155"), false);
    assert.equal(isValidCuit("123"), false);
  });
});

describe("afip parse", () => {
  it("extracts fields from AFIP inscripcion HTML", () => {
    const html = `
      <B>CONSTANCIA DE INSCRIPCION</B>
      <FONT face="Arial" SIZE="1">&nbsp;ZOOM IN S.A.</FONT>
      <FONT face="Arial" SIZE="1">CUIT:&nbsp;</FONT>
      <FONT face="Arial" SIZE="1">30-71234315-6</FONT>
      <FONT>Forma Jur&iacute;dica:&nbsp;</FONT>
      <FONT face="Arial" SIZE="1">SOC. ANONIMA</FONT>
      <FONT>Fecha Contrato Social:&nbsp;</FONT>
      <FONT face="Arial" SIZE="1">06-03-2012</FONT>
      IMPUESTOS/REGIMENES NACIONALES REGISTRADOS Y FECHA DE ALTA
      <TABLE><TR><TD><FONT>IVA</FONT></TD><TD><FONT>06-2012</FONT></TD></TR></TABLE>
      </TD></TR></TABLE>
      ACTIVIDADES NACIONALES REGISTRADAS Y FECHA DE ALTA
      <TABLE>
      <TR>
        <TD>Actividad principal:</TD>
        <TD>591110 (F-883)</TD>
        <TD>PRODUCCION DE FILMES</TD>
        <TD>Mes de inicio: 11/2013</TD>
      </TR>
      </TABLE>
      DOMICILIO FISCAL - ARCA
      <FONT>ALVAREZ THOMAS AV. 778</FONT>
      <FONT>1427-CIUDAD AUTONOMA BUENOS AIRES</FONT>
    `;
    const parsed = parseConstanciaHtml(html, "30712343156");
    assert.equal(parsed.denominacion, "ZOOM IN S.A.");
    assert.equal(parsed.tipoPersona, "SOC. ANONIMA");
    assert.equal(parsed.fechaContratoSocial, "06-03-2012");
    assert.equal(parsed.impuestos[0]?.descripcion, "IVA");
    assert.equal(parsed.actividades[0]?.codigo, "591110");
    assert.match(parsed.domicilioFiscal.texto ?? "", /ALVAREZ THOMAS/);
    assert.equal(parsed.error, null);
  });
});
