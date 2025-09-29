import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccountConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function parseServiceAccount(raw: string): ServiceAccountConfig | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const parseCandidate = (candidate: string): ServiceAccountConfig | undefined => {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const projectId = (parsed.project_id ?? parsed.projectId) as string | undefined;
      const clientEmail = (parsed.client_email ?? parsed.clientEmail) as string | undefined;
      const privateKeyRaw = (parsed.private_key ?? parsed.privateKey) as string | undefined;
      if (!projectId || !clientEmail || !privateKeyRaw) {
        console.warn("FIREBASE_SERVICE_ACCOUNT is missing required fields");
        return undefined;
      }

      return {
        projectId,
        clientEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
      };
    } catch (error) {
      console.warn("Invalid FIREBASE_SERVICE_ACCOUNT JSON payload", error);
      return undefined;
    }
  };

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseCandidate(trimmed);
  }

  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return parseCandidate(decoded);
  } catch (error) {
    console.warn("Failed to decode FIREBASE_SERVICE_ACCOUNT as base64", error);
    return undefined;
  }
}

function resolveCredential() {
  const direct = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (direct) {
    const parsed = parseServiceAccount(direct);
    if (parsed) {
      return cert(parsed);
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) {
    const serviceAccount: ServiceAccountConfig = {
      projectId,
      clientEmail,
      privateKey,
    };
    return cert(serviceAccount);
  }
  try {
    return applicationDefault();
  } catch (error) {
    console.error("Failed to load Firebase application default credentials", error);
    throw new Error("Firebase admin credentials are not configured.");
  }
}

let cachedDb: import("firebase-admin/firestore").Firestore | undefined;

export function getAdminDb() {
  if (cachedDb) return cachedDb;
  const app = getApps().length ? getApp() : initializeApp({ credential: resolveCredential() });
  cachedDb = getFirestore(app);
  return cachedDb;
}
