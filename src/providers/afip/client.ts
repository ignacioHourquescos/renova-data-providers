import { logger } from "../../lib/logger.js";
import type { AfipCaptchaChallenge, CookieJar } from "./types.js";

const BASE = "https://seti.afip.gob.ar/padron-puc-constancia-internet";
const SYSTEM_ID = "constanciaPadron";

const BASE_HEADERS: Record<string, string> = {
  Accept: "application/json, text/html, */*",
  Origin: "https://seti.afip.gob.ar",
  Referer: `${BASE}/jsp/Constancia.jsp`,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function mergeCookies(jar: CookieJar, headers: Headers): void {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : [headers.get("set-cookie")].filter((v): v is string => Boolean(v));

  for (const raw of setCookies) {
    const first = raw.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    jar.set(first.slice(0, eq), first.slice(eq + 1));
  }
}

export async function createSession(): Promise<CookieJar> {
  const jar: CookieJar = new Map();
  const response = await fetch(`${BASE}/jsp/Constancia.jsp`, {
    method: "GET",
    headers: BASE_HEADERS,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`AFIP sesión HTTP ${response.status}`);
  }
  mergeCookies(jar, response.headers);
  logger.debug("AFIP sesión iniciada");
  return jar;
}

export async function fetchCaptcha(jar: CookieJar): Promise<AfipCaptchaChallenge> {
  const url = new URL(`${BASE}/restCaptchaCode`);
  url.searchParams.set("type", "");
  url.searchParams.set("systemId", SYSTEM_ID);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...BASE_HEADERS,
      Cookie: cookieHeader(jar),
    },
    signal: AbortSignal.timeout(20_000),
  });
  mergeCookies(jar, response.headers);

  if (!response.ok) {
    throw new Error(`AFIP captcha HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    token?: string;
    imagenBase64Html?: string;
  };

  if (!data.token || !data.imagenBase64Html) {
    throw new Error("AFIP captcha response invalid");
  }

  return {
    token: data.token,
    imageBase64: data.imagenBase64Html,
  };
}

export async function submitConsulta(
  jar: CookieJar,
  cuit: string,
  captchaToken: string,
  captchaSolution: string,
): Promise<string> {
  const url = `${BASE}/ConstanciaAction.do?bar=${Date.now()}`;
  const payload = {
    data: JSON.stringify({
      cuit,
      txtSolucion: captchaSolution,
      txtToken: captchaToken,
      systemId: SYSTEM_ID,
    }),
  };

  logger.debug({ cuit }, "Posting AFIP ConstanciaAction");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      Cookie: cookieHeader(jar),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  mergeCookies(jar, response.headers);

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `AFIP consulta HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`,
    );
  }

  let parsed: { redirect?: string } | null = null;
  try {
    parsed = JSON.parse(text) as { redirect?: string };
  } catch {
    throw new Error(`AFIP consulta no JSON: ${text.slice(0, 200)}`);
  }

  if (!parsed.redirect) {
    throw new Error(
      `AFIP no devolvió redirect de constancia: ${text.slice(0, 300)}`,
    );
  }

  if (/ErrorAction\.do|MsgAction\.do/i.test(parsed.redirect)) {
    throw new Error(`AFIP respondió error: ${parsed.redirect}`);
  }

  logger.info({ redirect: parsed.redirect }, "AFIP redirect recibido");
  return parsed.redirect;
}

function resolveAfipUrl(redirect: string): string {
  if (redirect.startsWith("http")) return redirect;
  return new URL(redirect, `${BASE}/jsp/Constancia.jsp`).toString();
}

export async function fetchConstanciaHtml(
  jar: CookieJar,
  redirect: string,
): Promise<string> {
  const url = resolveAfipUrl(redirect);
  logger.info({ url }, "Fetching AFIP constancia HTML");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...BASE_HEADERS,
      Accept: "text/html,application/xhtml+xml",
      Cookie: cookieHeader(jar),
    },
    signal: AbortSignal.timeout(30_000),
  });
  mergeCookies(jar, response.headers);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `AFIP constancia HTTP ${response.status} (${url})${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return new TextDecoder("latin1").decode(buffer);
}

export async function fetchConstanciaPages(
  jar: CookieJar,
  redirect: string,
): Promise<string> {
  const first = await fetchConstanciaHtml(jar, redirect);
  if (!/ConstanciaSelector|tipoConstanciaSelector/i.test(`${redirect}\n${first}`)) {
    return first;
  }

  const pages: string[] = [first];
  for (const next of ["./ConstanciaOpcionBody.jsp", "./ConstanciaInscripcionBody.jsp"]) {
    try {
      const html = await fetchConstanciaHtml(jar, next);
      if (/CONSTANCIA DE INSCRIPC|CONSTANCIA DE OPCI|MONOTRIBUTO/i.test(html)) {
        pages.push(html);
      }
    } catch {
      // El selector a veces solo tiene una de las dos
    }
  }

  const scored = pages
    .map((html) => ({
      html,
      score:
        (/CONSTANCIA DE OPCI/i.test(html) ? 3 : 0) +
        (/CONSTANCIA DE INSCRIPC/i.test(html) ? 2 : 0) +
        (/MONOTRIBUTO/i.test(html) ? 2 : 0) +
        (html.length > 4000 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.html ?? first;
}
