"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthRedirectIfLoggedIn } from "../components/auth/AuthRedirectIfLoggedIn";
import { AuthDivider, AuthShell } from "../components/auth/AuthShell";
import { EmailLoginForm } from "../components/auth/EmailAuthForm";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";
import { AuthLoadingScreen } from "../components/auth/AuthLoadingScreen";
import { authCopy } from "../lib/authI18n";
import { resolvePostLoginPath } from "../lib/authRoutes";
import { authLinkStyle, authMutedStyle } from "../lib/authStyles";

function LoginContent() {
  const searchParams = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  const queryError = searchParams.get("error");
  const redirectNext = resolvePostLoginPath(searchParams.get("next"));

  return (
    <AuthRedirectIfLoggedIn postLoginPath={redirectNext}>
      <AuthShell
        title={authCopy.loginTitle}
        subtitle={authCopy.loginSubtitle}
        footer={
          <p style={{ ...authMutedStyle, margin: 0, textAlign: "center" }}>
            {authCopy.noAccount}{" "}
            <Link href="/signup" style={authLinkStyle}>
              {authCopy.goSignup}
            </Link>
          </p>
        }
      >
        {queryError ? (
          <p style={{ margin: "0 0 16px", color: "#fecaca", fontSize: 14 }}>
            {authCopy.authError}
          </p>
        ) : null}
        {notice ? (
          <p style={{ margin: "0 0 16px", color: "#fde68a", fontSize: 14 }}>{notice}</p>
        ) : null}
        <GoogleSignInButton redirectNext={redirectNext} onNotice={setNotice} />
        <AuthDivider />
        <EmailLoginForm redirectNext={redirectNext} />
      </AuthShell>
    </AuthRedirectIfLoggedIn>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <LoginContent />
    </Suspense>
  );
}
