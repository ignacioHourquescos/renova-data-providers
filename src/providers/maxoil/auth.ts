import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";
import { extractCsrfToken } from "./parse.js";
import type { MaxoilApiResponse } from "./types.js";

const config = providers.maxoil;

const LOGIN_PAGE_PATH = "/modules/auth/clientes/login.php";
const LOGIN_API_PATH = "/modules/auth/clientes/LoginController.php";
const LOGIN_TIMEOUT_MS = 20_000;

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** El portal exige la cookie de sesión y el token CSRF de esa misma sesión. */
export type MaxoilSession = {
  cookie: string;
  csrfToken: string;
};

let cachedSession: MaxoilSession | null = null;
let loginInFlight: Promise<MaxoilSession> | null = null;

export async function getSession(): Promise<MaxoilSession> {
  if (cachedSession) {
    return cachedSession;
  }

  if (loginInFlight) {
    return loginInFlight;
  }

  loginInFlight = login()
    .then((session) => {
      cachedSession = session;
      return session;
    })
    .finally(() => {
      loginInFlight = null;
    });

  return loginInFlight;
}

/**
 * Reemplaza una sesión que el portal rechazó. Si otro pedido ya la renovó,
 * devuelve esa en vez de volver a loguear: stock y listas se piden en paralelo.
 */
export async function renewSession(rejected: MaxoilSession): Promise<MaxoilSession> {
  if (cachedSession === rejected) {
    cachedSession = null;
  }
  return getSession();
}

/** Número de cliente; las listas de precios lo piden en el formulario. */
export function getClientCode(): string {
  return credentials().clientCode;
}

export function parseJsonBody<T>(body: string, label: string): T {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error(`Maxoil ${label}: respuesta vacía`);
  }
  if (trimmed.startsWith("<")) {
    throw new Error(`Maxoil ${label}: se esperaba JSON y llegó HTML`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Maxoil ${label}: JSON inválido`);
  }
}

function credentials(): { clientCode: string; token: string } {
  return {
    clientCode: (env.MAXOIL_CLIENT_CODE || config.username).trim(),
    token: (env.MAXOIL_TOKEN || config.password).trim(),
  };
}

/**
 * Mismo flujo que el formulario del portal: la página de login entrega la cookie
 * y un token CSRF, y el POST devuelve la cookie y el token de la sesión iniciada.
 */
async function login(): Promise<MaxoilSession> {
  const { clientCode, token } = credentials();
  if (!clientCode || !token) {
    throw new Error(
      "Maxoil cliente/token no configurados (providers/config.ts o MAXOIL_CLIENT_CODE / MAXOIL_TOKEN)",
    );
  }

  const jar = new Map<string, string>();
  logger.info("Maxoil login requested");

  const page = await fetch(`${config.baseUrl}${LOGIN_PAGE_PATH}`, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
  });
  mergeSetCookies(jar, page.headers);
  if (!page.ok) {
    throw new Error(`Maxoil login: la página de ingreso respondió HTTP ${page.status}`);
  }

  const pageCsrf = extractCsrfToken(await page.text());
  if (!pageCsrf) {
    throw new Error("Maxoil login: la página de ingreso no trae csrf-token");
  }

  const response = await fetch(`${config.baseUrl}${LOGIN_API_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: cookieHeader(jar),
      Origin: config.origin,
      Referer: `${config.baseUrl}${LOGIN_PAGE_PATH}`,
      "User-Agent": USER_AGENT,
      "X-CSRF-Token": pageCsrf,
    },
    body: JSON.stringify({
      action: "login",
      cod_cliente: clientCode,
      token,
      captcha_answer: "",
    }),
    signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
  });
  mergeSetCookies(jar, response.headers);

  const data = parseJsonBody<MaxoilApiResponse>(await response.text(), "login");
  if (data.code === "CAPTCHA_REQUIRED") {
    throw new Error("Maxoil login: el portal pide resolver un CAPTCHA");
  }
  if (!response.ok || data.success !== true) {
    throw new Error(
      `Maxoil login falló: ${data.error?.trim() || `HTTP ${response.status}`}`,
    );
  }

  const csrfToken = data.csrf_token?.trim();
  const cookie = cookieHeader(jar);
  if (!csrfToken || !cookie) {
    throw new Error("Maxoil login: respuesta sin cookie de sesión o csrf_token");
  }

  logger.info("Maxoil login OK");
  return { cookie, csrfToken };
}

function mergeSetCookies(jar: Map<string, string>, headers: Headers): void {
  const rawCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter((v): v is string => Boolean(v));

  for (const raw of rawCookies) {
    const first = raw.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq);
    const value = first.slice(eq + 1);
    if (!value || /deleted/i.test(value)) {
      jar.delete(name);
      continue;
    }
    jar.set(name, value);
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}
