"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "../lib/supabaseBrowser";

export type AuthSessionState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

export function useAuthSession(): AuthSessionState {
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

  return {
    session,
    user: session?.user ?? null,
    loading,
  };
}
