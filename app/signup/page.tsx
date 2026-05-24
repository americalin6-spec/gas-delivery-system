"use client";

import Link from "next/link";
import { AuthRedirectIfLoggedIn } from "../components/auth/AuthRedirectIfLoggedIn";
import { AuthDivider, AuthShell } from "../components/auth/AuthShell";
import { EmailSignupForm } from "../components/auth/EmailAuthForm";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";
import { authCopy } from "../lib/authI18n";
import { authLinkStyle, authMutedStyle } from "../lib/authStyles";

function SignupContent() {
  return (
    <AuthShell
      title={authCopy.signupTitle}
      subtitle={authCopy.signupSubtitle}
      footer={
        <p style={{ ...authMutedStyle, margin: 0, textAlign: "center" }}>
          {authCopy.hasAccount}{" "}
          <Link href="/login" style={authLinkStyle}>
            {authCopy.goLogin}
          </Link>
        </p>
      }
    >
      <GoogleSignInButton />
      <AuthDivider />
      <EmailSignupForm />
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <AuthRedirectIfLoggedIn>
      <SignupContent />
    </AuthRedirectIfLoggedIn>
  );
}
