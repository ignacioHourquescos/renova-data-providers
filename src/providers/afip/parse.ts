import * as cheerio from "cheerio";
import type { AfipActividad, AfipConstancia, AfipImpuesto } from "./types.js";

function clean(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function decodeBasic(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&Aacute;/gi, "Á")
    .replace(/&Eacute;/gi, "É")
    .replace(/&Iacute;/gi, "Í")
    .replace(/&Oacute;/gi, "Ó")
    .replace(/&Uacute;/gi, "Ú")
    .replace(/&Ntilde;/gi, "Ñ");
}

function firstMatch(html: string, re: RegExp): string | null {
  const match = html.match(re);
  return match?.[1] ? clean(decodeBasic(match[1])) : null;
}

function parseImpuestos(html: string): AfipImpuesto[] {
  const impuestos: AfipImpuesto[] = [];
  const tableMatch = html.match(
    /IMPUESTOS\/REGIMENES NACIONALES REGISTRADOS[\s\S]*?<\/TABLE>\s*<\/TD>\s*<\/TR>\s*<\/TABLE>/i,
  );
  if (!tableMatch) return impuestos;

  const $ = cheerio.load(tableMatch[0]);
  $("tr").each((_, row) => {
    const cells = $(row)
      .children("td")
      .toArray()
      .map((cell) => clean($(cell).text()));
    if (cells.length < 2) return;
    const descripcion = cells[0] ?? "";
    const periodo = cells[1] ?? "";
    if (!descripcion || descripcion.startsWith("*") || !/\d/.test(periodo)) return;
    impuestos.push({ descripcion, periodo });
  });
  return impuestos;
}

function parseActividades(html: string): AfipActividad[] {
  const actividades: AfipActividad[] = [];
  const block =
    html.match(
      /ACTIVIDADES NACIONALES REGISTRADAS[\s\S]*?(?=DOMICILIO FISCAL|ACTIVIDADES PROVINCIALES|$)/i,
    )?.[0] ?? html;
  const $ = cheerio.load(block);

  $("tr").each((_, row) => {
    const cells = $(row)
      .children("td")
      .toArray()
      .map((cell) => clean($(cell).text()));
    if (cells.length < 3) return;

    const header = cells[0] ?? "";
    const codigoCell = cells[1] ?? "";
    const descripcion = cells[2] ?? "";
    const periodoCell = cells[3] ?? "";

    const codigoMatch = codigoCell.match(/(\d{6})/);
    if (!codigoMatch || !descripcion) return;
    if (!/principal|secundaria/i.test(header) && cells.length < 4) return;

    actividades.push({
      codigo: codigoMatch[1] ?? null,
      descripcion,
      periodo: clean(periodoCell.replace(/Mes de inicio:\s*/i, "")) || null,
    });
  });

  return actividades;
}

function parseDomicilio(html: string): string | null {
  const match = html.match(
    /DOMICILIO FISCAL\s*-?\s*ARCA[\s\S]*?<FONT[^>]*>([\s\S]*?)<\/FONT>[\s\S]*?<FONT[^>]*>([\s\S]*?)<\/FONT>/i,
  );
  if (!match) {
    return firstMatch(html, /DOMICILIO FISCAL\s*-?\s*ARCA[\s\S]{0,400}?>([A-Z0-9].{5,80})</i);
  }
  const line1 = clean(decodeBasic(match[1] ?? ""));
  const line2 = clean(decodeBasic(match[2] ?? ""));
  return clean([line1, line2].filter(Boolean).join(" ")) || null;
}

export function parseConstanciaHtml(html: string, cuit: string): AfipConstancia {
  const looksLikeForm =
    /CUIT del Contribuyente/i.test(html) && /tokenCaptcha/i.test(html);
  const looksError = /ErrorAction\.do|MsgAction\.do/i.test(html);

  if (looksLikeForm) {
    return emptyResult(cuit, html, "AFIP volvió al formulario (captcha o sesión inválida)");
  }
  if (looksError && !/CONSTANCIA DE INSCRIPC/i.test(html)) {
    return emptyResult(cuit, html, "AFIP no devolvió una constancia válida");
  }

  const denominacion = firstMatch(
    html,
    /<FONT[^>]*>\s*([^<]+?)\s*<\/FONT>[\s\S]{0,200}?CUIT:/i,
  );
  const tipoPersona = firstMatch(
    html,
    /Forma Jur(?:&iacute;|[ií])dica:[\s\S]*?<FONT[^>]*>\s*([^<]+?)\s*<\/FONT>/i,
  );
  const fechaContratoSocial = firstMatch(
    html,
    /Fecha Contrato[\s\S]*?Social:[\s\S]*?<FONT[^>]*>\s*([^<]+?)\s*<\/FONT>/i,
  );

  const parsed: AfipConstancia = {
    cuit,
    denominacion: denominacion || null,
    tipoPersona: tipoPersona || null,
    fechaContratoSocial: fechaContratoSocial || null,
    impuestos: parseImpuestos(html),
    actividades: parseActividades(html),
    domicilioFiscal: { texto: parseDomicilio(html) },
    html,
    error: null,
  };

  if (!parsed.denominacion && !/CONSTANCIA DE INSCRIPC/i.test(html)) {
    parsed.error = "Se obtuvo HTML pero no se pudo parsear la constancia";
  }

  return parsed;
}

function emptyResult(cuit: string, html: string, error: string): AfipConstancia {
  return {
    cuit,
    denominacion: null,
    tipoPersona: null,
    fechaContratoSocial: null,
    impuestos: [],
    actividades: [],
    domicilioFiscal: { texto: null },
    html,
    error,
  };
}
