/**
 * Firebase, initialised lazily and only if configured.
 *
 * Two things worth knowing about this file:
 *
 * 1. The browser talks to Firebase directly. There is no server of ours in
 *    between, which is what lets accounts exist without giving up the
 *    zero-cost static architecture. The security boundary is therefore
 *    Firestore rules (see firestore.rules), NOT server-side checks — a rule
 *    that is wrong is a door left open, so that file matters more than this one.
 *
 * 2. A Firebase web API key is not a secret. It identifies the project; it does
 *    not grant access. Google documents it as public and it ships in every
 *    Firebase web app's bundle. It lives in env vars here for tidiness and so
 *    the repo is not tied to one project — not because exposure is a risk.
 *
 * If the config is absent the app runs exactly as it did before: preferences
 * stay on the device and no account UI appears. Nothing here is required to
 * read the paper.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Every field must be present; a half-configured project fails confusingly. */
export const isConfigured: boolean = Object.values(config).every(
  (v) => typeof v === "string" && v.length > 0
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function ensureApp(): FirebaseApp | null {
  // Server-side rendering has no business holding an auth session.
  if (typeof window === "undefined" || !isConfigured) return null;
  if (app) return app;

  app = getApps().length
    ? getApps()[0]
    : initializeApp(config as Required<typeof config>);
  return app;
}

export function getAuthClient(): Auth | null {
  const a = ensureApp();
  if (!a) return null;
  if (!authInstance) authInstance = getAuth(a);
  return authInstance;
}

export function getDb(): Firestore | null {
  const a = ensureApp();
  if (!a) return null;
  if (!dbInstance) dbInstance = getFirestore(a);
  return dbInstance;
}

/** Turns Firebase's error codes into something a reader can act on. */
export function authErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "That email address does not look right.";
    case "auth/email-already-in-use":
      return "There is already an account with that email. Try signing in.";
    case "auth/weak-password":
      return "Use at least six characters.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Those details do not match an account.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/network-request-failed":
      return "No connection. Your reading is saved on this device meanwhile.";
    case "auth/popup-closed-by-user":
      return "Sign-in was closed before it finished.";
    case "auth/operation-not-allowed":
      return "That sign-in method is not enabled on this project yet.";
    default:
      return "Could not complete that. Try again.";
  }
}
