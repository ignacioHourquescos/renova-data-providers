import * as cheerio from "cheerio";
import type {
  AfipActividad,
  AfipCondicionFiscal,
  AfipConstancia,
  AfipDomicilio,
  AfipImpuesto,
} from "./types.js";

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

function fontTexts(html: string): string[] {
  return [...html.matchAll(/<FONT[^>]*>([\s\S]*?)<\/FONT>/gi)]
    .map((match) => clean(decodeBasic(match[1] ?? "").replace(/<[^>]+>/g, " ")))
    .filter((text) => text.length > 0);
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
    )?.[0] ?? "";

  if (block) {
    const $ = cheerio.load(block);
    $("tr").each((_, row) => {
      const cells = $(row)
        .children("td")
        .toArray()
        .map((cell) => clean($(cell).text()));
      if (cells.length < 3) return;
      const codigoMatch = (cells[1] ?? "").match(/(\d{6})/);
      const descripcion = cells[2] ?? "";
      if (!codigoMatch || !descripcion) return;
      actividades.push({
        codigo: codigoMatch[1] ?? null,
        descripcion,
        periodo: clean((cells[3] ?? "").replace(/Mes de inicio:\s*/i, "")) || null,
      });
    });
  }

  if (actividades.length === 0) {
    const monoAct = firstMatch(
      html,
      /descripcion de la categoria[\s\S]{0,800}?<FONT[^>]*>([A-ZÁÉÍÓÚÑa-záéíóúñ &./-]{8,80})/i,
    );
    if (monoAct && !/CATEGOR/i.test(monoAct)) {
      actividades.push({ codigo: null, descripcion: monoAct, periodo: null });
    }
  }

  return actividades;
}

function parseDomicilio(html: string): AfipDomicilio {
  const empty: AfipDomicilio = {
    texto: null,
    calle: null,
    localidad: null,
    provincia: null,
    codigoPostal: null,
  };

  const afterHeading = html.split(/DOMICILIO FISCAL\s*-?\s*ARCA/i)[1];
  const texts = fontTexts(html);
  const headingFonts = afterHeading ? fontTexts(afterHeading).slice(0, 6) : [];
  const arcaIdx = texts.findIndex((text) => /DOMICILIO FISCAL/i.test(text) && /ARCA/i.test(text));
  const afterArca =
    headingFonts.length > 0
      ? headingFonts
      : arcaIdx >= 0
        ? texts.slice(arcaIdx + 1, arcaIdx + 6)
        : [];

  let calle: string | null = null;
  let localidad: string | null = null;
  let provincia: string | null = null;
  let codigoPostal: string | null = null;

  if (afterArca.length > 0) {
    calle = afterArca[0] ?? null;
    const cpLine = afterArca.find((line) => /^\d{4}-/.test(line));
    if (cpLine) {
      const cp = cpLine.match(/^(\d{4})-(.+)$/);
      codigoPostal = cp?.[1] ?? null;
      provincia = cp?.[2] ?? null;
      localidad = afterArca.find((line) => line !== calle && line !== cpLine) ?? provincia;
    } else if (afterArca[1]) {
      localidad = afterArca[1];
      provincia = afterArca[2] ?? null;
    }
  }

  if (!calle) {
    const cuitIdx = texts.findIndex((text) => /^\d{2}-\d{8}-\d$/.test(text));
    if (cuitIdx >= 0) {
      const nearby = texts.slice(cuitIdx + 1, cuitIdx + 8).filter((text) => {
        if (/^CUIT|Forma Jur|Fecha Contrato|Denominaci/i.test(text)) return false;
        if (/CATEGOR|MONOTRIBUTO|CONSTANCIA|Vigencia|Verificador|FECHA/i.test(text)) return false;
        return text.length > 3 && text.length < 90;
      });
      calle = nearby[0] ?? null;
      const cpLine = nearby.find((line) => /^\d{4}-/.test(line));
      if (cpLine) {
        const cp = cpLine.match(/^(\d{4})-(.+)$/);
        codigoPostal = cp?.[1] ?? null;
        provincia = cp?.[2] ?? null;
        localidad = nearby.find((line) => line !== calle && line !== cpLine) ?? null;
      }
    }
  }

  const texto = clean([calle, localidad, codigoPostal && provincia ? `${codigoPostal}-${provincia}` : provincia]
    .filter(Boolean)
    .join(" ")) || null;

  return { texto, calle, localidad, provincia, codigoPostal };
}

function parseDenominacion(html: string): string | null {
  const beforeCuit = firstMatch(html, /<FONT[^>]*>\s*([^<]+?)\s*<\/FONT>[\s\S]{0,240}?CUIT:/i);
  if (beforeCuit && !/CONSTANCIA|ARCA|CUIT/i.test(beforeCuit)) return beforeCuit;

  const afterCuit = firstMatch(
    html,
    /CUIT:[\s\S]{0,500}?<FONT[^>]*>\s*\d{2}-\d{8}-\d\s*<\/FONT>[\s\S]{0,500}?<FONT[^>]*>\s*([^<]{3,80}?)\s*<\/FONT>/i,
  );
  if (afterCuit && !/DOMICILIO|CATEGOR|MONOTRIBUTO|CONSTANCIA/i.test(afterCuit)) {
    return afterCuit;
  }

  const texts = fontTexts(html);
  const cuitIdx = texts.findIndex((text) => /^\d{2}-\d{8}-\d$/.test(text));
  if (cuitIdx > 0 && texts[cuitIdx - 1] && texts[cuitIdx - 1]!.length > 2) {
    const prev = texts[cuitIdx - 1]!;
    if (!/CUIT|CONSTANCIA/i.test(prev)) return prev;
  }
  if (cuitIdx >= 0) {
    const next = texts[cuitIdx + 1];
    if (next && next.length > 2 && !/DOMICILIO|CATEGOR|MONOTRIBUTO/i.test(next)) {
      return next;
    }
  }
  return null;
}

function parseCategoriaMonotributo(html: string): string | null {
  return (
    firstMatch(
      html,
      /CATEGOR[IÍ]A[\s\S]{0,600}?<FONT[^>]*FONT-SIZE:\s*\d+pt[^>]*>\s*([A-Z0-9]{1,3})\s*<\/FONT>/i,
    ) ||
    firstMatch(html, /CATEGOR[IÍ]A[\s\S]{0,200}?\b([A-K])\b/i)
  );
}

function deriveCondicion(
  html: string,
  impuestos: AfipImpuesto[],
  categoriaMonotributo: string | null,
): AfipCondicionFiscal {
  const iva = impuestos.find((item) => /^IVA\b/i.test(item.descripcion));
  if (iva && /EXENT/i.test(iva.descripcion)) return "EXENTO";
  if (iva && /ACTIVO/i.test(iva.descripcion)) return "RESPONSABLE_INSCRIPTO";
  if (categoriaMonotributo || /MONOTRIBUTO/i.test(html) || /ConstanciaOpcion/i.test(html)) {
    return "MONOTRIBUTO";
  }
  if (iva) return "RESPONSABLE_INSCRIPTO";
  if (/CONSTANCIA DE INSCRIPC|CONSTANCIA DE OPCI/i.test(html)) return "NO_INSCRIPTO";
  return null;
}

function emptyDomicilio(): AfipDomicilio {
  return {
    texto: null,
    calle: null,
    localidad: null,
    provincia: null,
    codigoPostal: null,
  };
}

export function emptyConstancia(cuit: string, html: string | null, error: string): AfipConstancia {
  return {
    cuit,
    denominacion: null,
    tipoPersona: null,
    condicionFiscal: null,
    categoriaMonotributo: null,
    fechaContratoSocial: null,
    impuestos: [],
    actividades: [],
    domicilioFiscal: emptyDomicilio(),
    html,
    error,
  };
}

export function parseConstanciaHtml(html: string, cuit: string): AfipConstancia {
  const looksLikeForm =
    /CUIT del Contribuyente/i.test(html) && /tokenCaptcha/i.test(html);
  const looksError = /ErrorAction\.do|MsgAction\.do/i.test(html);
  const looksConstancia = /CONSTANCIA DE INSCRIPC|CONSTANCIA DE OPCI|MONOTRIBUTO|IMPUESTOS\/REGIMENES/i.test(
    html,
  );

  if (looksLikeForm) {
    return emptyConstancia(cuit, html, "AFIP volvió al formulario (captcha o sesión inválida)");
  }
  if (looksError && !looksConstancia) {
    return emptyConstancia(cuit, html, "AFIP no devolvió una constancia válida");
  }

  const impuestos = parseImpuestos(html);
  const categoriaMonotributo = parseCategoriaMonotributo(html);
  const domicilioFiscal = parseDomicilio(html);
  const denominacion = parseDenominacion(html);
  const tipoPersona =
    firstMatch(html, /Forma Jur(?:&iacute;|[ií])dica:[\s\S]*?<FONT[^>]*>\s*([^<]+?)\s*<\/FONT>/i) ||
    (looksConstancia && cuit.startsWith("20") ? "PERSONA FISICA" : null);
  const fechaContratoSocial = firstMatch(
    html,
    /Fecha Contrato[\s\S]*?Social:[\s\S]*?<FONT[^>]*>\s*([^<]+?)\s*<\/FONT>/i,
  );

  const parsed: AfipConstancia = {
    cuit,
    denominacion,
    tipoPersona,
    condicionFiscal: deriveCondicion(html, impuestos, categoriaMonotributo),
    categoriaMonotributo,
    fechaContratoSocial,
    impuestos,
    actividades: parseActividades(html),
    domicilioFiscal,
    html,
    error: null,
  };

  if (!parsed.denominacion && !looksConstancia) {
    parsed.error = "Se obtuvo HTML pero no se pudo parsear la constancia";
  }

  return parsed;
}
