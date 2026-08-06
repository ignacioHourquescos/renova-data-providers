import { logger } from "../../lib/logger.js";
import { providers } from "../config.js";

const config = providers.lubaires;

type LoginResponse = {
  token?: string;
  expiration?: string;
  expiresIn?: string;
};

let cachedToken: string | null = null;
let loginInFlight: Promise<string> | null = null;

/**
 * Devuelve un token válido. Si forceRefresh, hace login de nuevo.
 * Evita logins concurrentes con una sola promise en vuelo.
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken) {
    return cachedToken;
  }

  if (loginInFlight) {
    return loginInFlight;
  }

  loginInFlight = login()
    .then((token) => {
      cachedToken = token;
      return token;
    })
    .finally(() => {
      loginInFlight = null;
    });

  return loginInFlight;
}

export function clearAccessToken(): void {
  cachedToken = null;
}

async function login(): Promise<string> {
  if (!config.username || !config.password) {
    throw new Error("Lubaires username/password no configurados en providers/config.ts");
  }

  const url = `${config.baseUrl}/users/login`;
  logger.info("Lubaires login requested");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: config.origin,
      Referer: config.referer,
    },
    body: JSON.stringify({
      username: config.username,
      password: config.password,
      username_customer: "",
      source: "WEB",
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Lubaires login HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }

  const data = (await response.json()) as LoginResponse;
  if (!data.token) {
    throw new Error("Lubaires login: respuesta sin token");
  }

  logger.info(
    { expiration: data.expiration, expiresIn: data.expiresIn },
    "Lubaires login OK",
  );

  return data.token;
}
