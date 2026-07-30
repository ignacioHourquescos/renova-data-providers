import { logger } from "../../lib/logger.js";
import type { DnrpaApiResponse, DnrpaVehicle } from "./types.js";

const API_URL = "https://www2.jus.gov.ar/dnrpa-site/api/estimador/estimar";

const HEADERS: Record<string, string> = {
  "Content-Type": "application/json;charset=UTF-8",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www2.jus.gov.ar/dnrpa-site/",
  Origin: "https://www2.jus.gov.ar",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/**
 * POST al estimador DNRPA.
 * CodigoTramite: 083000 = NACIONAL, 084000 = IMPORTADO
 */
export async function callEstimar(
  patente: string,
  recaptchaToken: string,
  codigoTramite: "083000" | "084000" = "083000",
): Promise<DnrpaApiResponse> {
  const payload = {
    Dominio: patente.toLowerCase(),
    ValorDeclarado: 1,
    CodigoProvincia: "B",
    CodigoTramite: codigoTramite,
    RecaptchaResponse: recaptchaToken,
    Es08D: false,
    IncluirImpuestos: false,
  };

  logger.debug({ codigoTramite, patente }, "Calling DNRPA estimar API");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`DNRPA API HTTP ${response.status}`);
  }

  return (await response.json()) as DnrpaApiResponse;
}

export function parseApiResponse(data: DnrpaApiResponse): DnrpaVehicle | null {
  const t = data.Transferencia;
  if (!t?.Marca || !t?.Modelo) {
    return null;
  }

  return {
    make: t.Marca.trim() || null,
    model: t.Modelo.trim() || null,
    type: t.Tipo?.trim() || null,
    year: t.Anio != null ? String(t.Anio) : null,
    origin: t.Origen?.trim() || null,
    error: null,
  };
}
