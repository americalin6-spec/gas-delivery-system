"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authCopy } from "../../lib/authI18n";
import {
  authErrorStyle,
  authInputStyle,
  authPrimaryBtnStyle,
} from "../../lib/authStyles";
import { buildOAuthRedirectUrl } from "../../lib/authOAuth";
import { getSupabaseBrowser } from "../../lib/supabaseBrowser";
import { DASHBOARD_PATH, resolveOAuthRedirectOrigin } from "../../lib/supabaseConfig";

export function EmailLoginForm({
  redirectNext = DASHBOARD_PATH,
}: {
  redirectNext?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError(authCopy.emailRequired);
      return;
    }
    if (!password) {
      setError(authCopy.passwordRequired);
      return;
    }
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(signInError.message || authCopy.authError);
      return;
    }
    router.push(redirectNext);
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error ? <p style={authErrorStyle}>{error}</p> : null}
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 14, color: "#cbd5e1" }}>{authCopy.email}</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={authInputStyle}
          placeholder="you@company.com"
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 14, color: "#cbd5e1" }}>{authCopy.password}</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={authInputStyle}
        />
      </label>
      <button type="submit" disabled={busy} style={{ ...authPrimaryBtnStyle, opacity: busy ? 0.8 : 1 }}>
        {busy ? authCopy.loggingIn : authCopy.loginSubmit}
      </button>
    </form>
  );
}

export function EmailSignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError(authCopy.emailRequired);
      return;
    }
    if (!password) {
      setError(authCopy.passwordRequired);
      return;
    }
    if (password !== confirm) {
      setError(authCopy.passwordMismatch);
      return;
    }
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: buildOAuthRedirectUrl({
          origin: resolveOAuthRedirectOrigin() || window.location.origin,
          next: DASHBOARD_PATH,
        }),
      },
    });
    setBusy(false);
    if (signUpError) {
      setError(signUpError.message || authCopy.authError);
      return;
    }
    if (data.session) {
      setNotice(authCopy.signupSuccess);
      router.push(DASHBOARD_PATH);
      router.refresh();
      return;
    }
    setNotice(authCopy.signupCheckEmail);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error ? <p style={authErrorStyle}>{error}</p> : null}
      {notice ? (
        <p
          style={{
            ...authErrorStyle,
            background: "rgba(34,197,94,0.12)",
            borderColor: "rgba(34,197,94,0.35)",
            color: "#bbf7d0",
          }}
        >
          {notice}
        </p>
      ) : null}
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 14, color: "#cbd5e1" }}>{authCopy.email}</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={authInputStyle}
          placeholder="you@company.com"
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 14, color: "#cbd5e1" }}>{authCopy.password}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={authInputStyle}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 14, color: "#cbd5e1" }}>{authCopy.confirmPassword}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={authInputStyle}
        />
      </label>
      <button type="submit" disabled={busy} style={{ ...authPrimaryBtnStyle, opacity: busy ? 0.8 : 1 }}>
        {busy ? authCopy.signingUp : authCopy.signupSubmit}
      </button>
    </form>
  );
}
