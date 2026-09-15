"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { getAuthClient, isConfigured, authErrorMessage } from "@/lib/firebase";

export type Reader = {
  uid: string;
  email: string | null;
  name: string | null;
};

type Ctx = {
  /** Null when signed out, or when Firebase is not configured at all. */
  reader: Reader | null;
  /** False until the auth session has been restored from storage. */
  ready: boolean;
  /** False when the project has no Firebase config; the app still works. */
  available: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<Ctx | null>(null);

/** Firebase throws objects with a `code`; turn them into readable sentences. */
function toMessage(err: unknown): Error {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return new Error(authErrorMessage(code));
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [reader, setReader] = useState<Reader | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const auth = getAuthClient();
    if (!auth) {
      // No project configured — settle immediately so the UI stops waiting.
      setReady(true);
      return;
    }

    const stop = onAuthStateChanged(
      auth,
      (user: User | null) => {
        setReader(
          user
            ? { uid: user.uid, email: user.email, name: user.displayName }
            : null
        );
        setReady(true);
      },
      () => setReady(true)
    );
    return stop;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const auth = getAuthClient();
      if (!auth) throw new Error("Accounts are not enabled on this build.");
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const trimmed = name.trim();
        if (trimmed) {
          await updateProfile(cred.user, { displayName: trimmed });
          setReader({
            uid: cred.user.uid,
            email: cred.user.email,
            name: trimmed,
          });
        }
      } catch (err) {
        throw toMessage(err);
      }
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = getAuthClient();
    if (!auth) throw new Error("Accounts are not enabled on this build.");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw toMessage(err);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getAuthClient();
    if (!auth) throw new Error("Accounts are not enabled on this build.");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      throw toMessage(err);
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const auth = getAuthClient();
    if (!auth) throw new Error("Accounts are not enabled on this build.");
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      throw toMessage(err);
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = getAuthClient();
    if (!auth) return;
    await fbSignOut(auth);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      reader,
      ready,
      available: isConfigured,
      signUp,
      signIn,
      signInWithGoogle,
      resetPassword,
      signOut,
    }),
    [reader, ready, signUp, signIn, signInWithGoogle, resetPassword, signOut]
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount(): Ctx {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}
