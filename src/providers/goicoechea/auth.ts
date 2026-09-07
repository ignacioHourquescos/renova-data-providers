import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";
import type { GoicoecheaLoginResponse } from "./types.js";

const config = providers.goicoechea;

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const BASE_HEADERS: Record<string, string> = {
  Accept: "application/json, text/javascript, */*; q=0.01",
  Origin: config.origin,
  Referer: config.referer,
  "User-Agent": USER_AGENT,
  "X-Requested-With": "XMLHttpRequest",
};

let cachedCookie: string | null = null;
let loginInFlight: Promise<string> | null = null;

export async function getSessionCookie(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedCookie) {
    return cachedCookie;
  }

  if (loginInFlight) {
    return loginInFlight;
  }

  loginInFlight = login()
    .then((cookie) => {
      cachedCookie = cookie;
      return cookie;
    })
    .finally(() => {
      loginInFlight = null;
    });

  return loginInFlight;
}

export function clearSessionCookie(): void {
  cachedCookie = null;
}

export function mergeSetCookies(
  jar: Map<string, string>,
  headers: Headers,
): void {
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
    if (!name) continue;
    if (!value || /deleted/i.test(value)) {
      jar.delete(name);
      continue;
    }
    jar.set(name, value);
  }
}

export function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function login(): Promise<string> {
  if (!config.username || !config.password) {
    throw new Error(
      "Goicoechea username/password no configurados en providers/config.ts",
    );
  }

  const jar = new Map<string, string>();
  logger.info("Goicoechea login requested");

  const home = await fetch(`${config.baseUrl}/`, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  mergeSetCookies(jar, home.headers);

  const homeBody = await home.text();
  if (looksLikeUserAgentCrash(homeBody)) {
    throw new Error(
      "Goicoechea rechazó el User-Agent. Usar un UA de Chrome real.",
    );
  }

  const response = await fetch(`${config.baseUrl}/account/log/login`, {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: cookieHeader(jar),
    },
    body: new URLSearchParams({
      username: config.username,
      password: config.password,
      remember: "true",
    }),
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  mergeSetCookies(jar, response.headers);

  const bodyText = await response.text();
  if (looksLikeUserAgentCrash(bodyText)) {
    throw new Error(
      "Goicoechea rechazó el User-Agent. Usar un UA de Chrome real.",
    );
  }

  const data = parseJsonBody<GoicoecheaLoginResponse>(bodyText, "login");
  if (!data.success) {
    throw new Error(data.error?.trim() || "Goicoechea login falló");
  }

  const cookie = cookieHeader(jar);
  if (!cookie) {
    throw new Error("Goicoechea login: respuesta sin cookies de sesión");
  }

  logger.info("Goicoechea login OK");
  return cookie;
}

export function looksLikeUserAgentCrash(body: string): boolean {
  return body.includes("gemini-") && body.includes("Unable to load properties");
}

export function parseJsonBody<T>(body: string, label: string): T {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error(`Goicoechea ${label}: respuesta vacía`);
  }
  if (trimmed.startsWith("<") || looksLikeUserAgentCrash(trimmed)) {
    throw new Error(`Goicoechea ${label}: se esperaba JSON y llegó HTML`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Goicoechea ${label}: JSON inválido`);
  }
}
