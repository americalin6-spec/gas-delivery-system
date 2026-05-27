"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabaseBrowser } from "../../lib/supabaseBrowser";

export type AuthSessionState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthSessionState | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

/**
 * Root auth session host for hydration isolation testing.
 * No redirects — middleware handles route protection.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let mounted = true;

    const applySession = (next: Session | null) => {
      if (!mounted) return;
      setSession(next);
      setLoading(false);
    };

    void supabase.auth.getSession().then(({ data: { session: initial } }) => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[AuthProvider] getSession", initial?.user?.id ?? null);
      }
      applySession(initial);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[AuthProvider] onAuthStateChange", event, nextSession?.user?.id ?? null);
      }
      applySession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value: AuthSessionState = {
    session,
    user: session?.user ?? null,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession(): AuthSessionState {
  const ctx = useContext(AuthContext);
  if (ctx == null) {
    throw new Error("useAuthSession must be used within AuthProvider");
  }
  return ctx;
}
