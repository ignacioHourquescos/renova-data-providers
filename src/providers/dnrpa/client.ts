import { logger } from "../../lib/logger.js";
import type { DnrpaApiResponse, DnrpaVehicle } from "./types.js";

const BASE = "https://www2.jus.gov.ar/dnrpa-site";
const API_URL = `${BASE}/api/estimador/estimar`;
const CSRF_URL = `${BASE}/api/csrf/token`;

const BASE_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  Referer: `${BASE}/`,
  Origin: "https://www2.jus.gov.ar",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

type Session = {
  csrfToken: string;
  cookieHeader: string;
};

/**
 * Obtiene CSRF (Double Submit Cookie) requerido por DNRPA desde ~2024/2025.
 * Sin X-CSRF-Token el API responde 403.
 */
async function createSession(): Promise<Session> {
  const response = await fetch(CSRF_URL, {
    method: "GET",
    headers: BASE_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`CSRF token HTTP ${response.status}`);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("CSRF token response invalid");
  }

  const cookieHeader = extractCookieHeader(response.headers);
  logger.debug("CSRF token obtained");

  return {
    csrfToken: data.token,
    cookieHeader,
  };
}

function extractCookieHeader(headers: Headers): string {
  // Node fetch: getSetCookie() si existe; fallback a set-cookie único
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : [headers.get("set-cookie")].filter((v): v is string => Boolean(v));

  const pairs: string[] = [];
  for (const raw of setCookies) {
    // "XSRF-TOKEN=abc; path=/; HttpOnly" -> "XSRF-TOKEN=abc"
    const first = raw.split(";")[0]?.trim();
    if (first) pairs.push(first);
  }
  return pairs.join("; ");
}

/**
 * POST al estimador DNRPA.
 * CodigoTramite: 083000 = NACIONAL, 084000 = IMPORTADO
 */
export async function callEstimar(
  patente: string,
  recaptchaToken: string,
  codigoTramite: "083000" | "084000" = "083000",
  session?: Session,
): Promise<DnrpaApiResponse> {
  const activeSession = session ?? (await createSession());

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

  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    "Content-Type": "application/json;charset=UTF-8",
    "X-CSRF-Token": activeSession.csrfToken,
  };
  if (activeSession.cookieHeader) {
    headers.Cookie = activeSession.cookieHeader;
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `DNRPA API HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
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

export { createSession };
export type { Session };
