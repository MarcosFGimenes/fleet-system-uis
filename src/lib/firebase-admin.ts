import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function resolveCredential() {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    try {
      const parsed = JSON.parse(serviceAccount);
      return cert(parsed);
    } catch (error) {
      console.warn("Invalid FIREBASE_SERVICE_ACCOUNT JSON", error);
    }
  }
  try {
    return applicationDefault();
  } catch (error) {
    console.error("Failed to load Firebase application default credentials", error);
    throw new Error("Firebase admin credentials are not configured.");
  }
}

const adminApp = getApps().length ? getApp() : initializeApp({ credential: resolveCredential() });

export const adminDb = getFirestore(adminApp);
