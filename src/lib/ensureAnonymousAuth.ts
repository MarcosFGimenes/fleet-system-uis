import { signInAnonymously } from "firebase/auth";
import { auth } from "@/lib/firebase";

let inFlight: Promise<void> | null = null;

/**
 * Garante que existe um usuário autenticado no Firebase Auth, sem exigir login.
 * Usado para permitir acesso público ao checklist quando as regras do Firestore
 * exigem request.auth != null.
 */
export function ensureAnonymousAuth(): Promise<void> {
  if (auth.currentUser) {
    return Promise.resolve();
  }

  if (!inFlight) {
    inFlight = signInAnonymously(auth)
      .then(() => undefined)
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}

