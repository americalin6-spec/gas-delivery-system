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
  const initialCheckDoneRef = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    initialCheckDoneRef.current = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.auth.getSession();
        setSession(data.session ?? null);
      } else {
        setSession(null);
      }
      initialCheckDoneRef.current = true;
      setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!initialCheckDoneRef.current) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
