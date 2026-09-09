import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "./logger.js";

function readJsonFile(filePath: string): ServiceAccount | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as ServiceAccount;
}

function getServiceAccount(): ServiceAccount | null {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  }
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID || "renova-errores-2",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: String(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n"),
    };
  }
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(process.cwd(), "firebase-service-account.json"),
    path.join(process.cwd(), "..", "renova-order-manager", "firebase-service-account.json"),
  ].filter(Boolean) as string[];
  for (const filePath of candidates) {
    const parsed = readJsonFile(filePath);
    if (parsed) return parsed;
  }
  return null;
}

let firestore: Firestore | null = null;
let initAttempted = false;

export function getAdminFirestore(): Firestore | null {
  if (firestore) return firestore;
  if (initAttempted) return null;
  initAttempted = true;
  try {
    const serviceAccount = getServiceAccount();
    if (!serviceAccount) {
      logger.warn("Firebase Admin no configurado: no se puede leer price-listas-v2");
      return null;
    }
    if (!getApps().length) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    firestore = getFirestore();
    return firestore;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, "Firebase Admin init failed");
    return null;
  }
}
