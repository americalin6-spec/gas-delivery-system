"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "../lib/supabaseBrowser";

export type AuthSessionState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

export function useAuthSession(): AuthSessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
  };
}
