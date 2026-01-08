import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccountConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function resolveProjectId(): string | undefined {
  // Server-side preferred env vars
  const direct =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    // NEXT_PUBLIC_* is not ideal for server config, but projectId is not secret,
    // and some deployments only set the public Firebase vars.
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return direct?.trim() || undefined;
}

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

  const projectId = resolveProjectId();
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
  const projectId = resolveProjectId();
  if (!projectId && !process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.FIREBASE_PROJECT_ID) {
    // When using applicationDefault() outside GCP, Google Auth often can't infer projectId.
    // Fail fast with an actionable message instead of a generic Firestore error.
    console.warn(
      "Firebase projectId not set. Set FIREBASE_PROJECT_ID (recommended) or GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT."
    );
  }

  const app =
    getApps().length ? getApp() : initializeApp({ credential: resolveCredential(), projectId: projectId });
  cachedDb = getFirestore(app);
  return cachedDb;
}
