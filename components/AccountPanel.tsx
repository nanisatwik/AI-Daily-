"use client";

import { useState, type FormEvent } from "react";
import { useAccount } from "./Account";
import { usePreferences } from "./Preferences";
import { Fleuron } from "./Ornament";

type Mode = "in" | "up";

/**
 * Register for delivery, or sign in to an existing subscription.
 *
 * Renders nothing when the build has no Firebase project — the paper works
 * without accounts, and an account form that cannot succeed is worse than no
 * form at all.
 */
export default function AccountPanel() {
  const { reader, ready, available, signIn, signUp, signInWithGoogle, resetPassword, signOut } =
    useAccount();
  const { syncing, prefs } = usePreferences();

  const [mode, setMode] = useState<Mode>("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!available) return null;

  if (!ready) {
    return (
      <div className="border border-[var(--rule)] p-5">
        <p className="meta">Checking your subscription…</p>
      </div>
    );
  }

  /* ---------------- signed in ---------------- */
  if (reader) {
    return (
      <div className="border-2 border-[var(--ink)] p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="kicker text-[var(--accent)]">Subscriber</span>
          <span className="h-px flex-1 bg-[var(--rule)]" />
          <Fleuron className="h-3.5 w-7 text-[var(--rule)]" />
        </div>

        <p className="font-head text-[1.15rem] leading-tight text-[var(--ink)]">
          {reader.name || reader.email}
        </p>
        {reader.name && reader.email && (
          <p className="meta mt-1">{reader.email}</p>
        )}

        <p className="font-body italic mt-3 text-[14px] leading-relaxed text-[var(--ink-soft)]">
          {syncing
            ? `Your ${prefs.topics.length + prefs.cities.length} preferences and ${prefs.clippings.length} clippings follow you to any device you sign in on.`
            : "Signed in, but preferences are not syncing right now — they are safe on this device."}
        </p>

        <button
          type="button"
          onClick={() => signOut()}
          className="kicker mt-5 cursor-pointer border border-[var(--rule)] px-3 py-1.5 text-[var(--ink-soft)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)]"
        >
          Sign out
        </button>
      </div>
    );
  }

  /* ---------------- signed out ---------------- */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "up") await signUp(email, password, name);
      else await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete that.");
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email) {
      setError("Enter your email first, then ask for a reset.");
      return;
    }
    setError(null);
    try {
      await resetPassword(email);
      setNotice("A reset link is on its way to that address.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that.");
    }
  };

  const field =
    "w-full border border-[var(--rule)] bg-transparent px-3 py-2 font-body text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none";

  return (
    <div className="border-2 border-[var(--ink)] p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="kicker text-[var(--accent)]">
          {mode === "up" ? "Register for delivery" : "Subscriber sign in"}
        </span>
        <span className="h-px flex-1 bg-[var(--rule)]" />
      </div>

      <p className="font-body italic mb-5 text-[14px] leading-relaxed text-[var(--ink-soft)]">
        An account carries your desks, cities and clippings between devices.
        Everything works without one — this only adds the carrying.
      </p>

      <form onSubmit={submit} className="space-y-3">
        {mode === "up" && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoComplete="name"
            className={field}
          />
        )}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className={field}
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete={mode === "up" ? "new-password" : "current-password"}
          className={field}
        />

        {error && (
          <p className="font-body text-[13px] leading-snug text-[var(--accent)]">
            {error}
          </p>
        )}
        {notice && (
          <p className="font-body italic text-[13px] leading-snug text-[var(--ink-soft)]">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="kicker w-full cursor-pointer border-2 border-[var(--ink)] px-4 py-2.5 text-[var(--ink)] transition-colors duration-300 hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-50"
        >
          {busy
            ? "One moment…"
            : mode === "up"
              ? "Begin subscription"
              : "Sign in"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-[var(--rule)]">
        <span className="h-px flex-1 bg-current" />
        <span className="meta">or</span>
        <span className="h-px flex-1 bg-current" />
      </div>

      <button
        type="button"
        onClick={() =>
          signInWithGoogle().catch((err) =>
            setError(err instanceof Error ? err.message : "Could not sign in.")
          )
        }
        className="kicker w-full cursor-pointer border border-[var(--rule)] px-4 py-2.5 text-[var(--ink-soft)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)]"
      >
        Continue with Google
      </button>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "up" ? "in" : "up");
            setError(null);
            setNotice(null);
          }}
          className="kicker cursor-pointer text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
        >
          {mode === "up" ? "Already a subscriber" : "Register instead"}
        </button>
        {mode === "in" && (
          <button
            type="button"
            onClick={forgot}
            className="kicker cursor-pointer text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
          >
            Forgotten password
          </button>
        )}
      </div>
    </div>
  );
}
