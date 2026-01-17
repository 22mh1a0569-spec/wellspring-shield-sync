import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "patient" | "doctor";

type AuthState = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return (data?.role as AppRole | undefined) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshRole = async () => {
    const u = user ?? session?.user;
    if (!u) {
      setRole(null);
      return;
    }
    const next = await fetchRole(u.id);
    setRole(next);
  };

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      // Only sync state here; fetch role outside to avoid deadlocks
      setTimeout(() => {
        if (nextSession?.user?.id) {
          fetchRole(nextSession.user.id).then(setRole).catch(() => setRole(null));
        } else {
          setRole(null);
        }
      }, 0);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user?.id) return fetchRole(session.user.id).then(setRole);
        setRole(null);
      })
      .finally(() => setLoading(false));

    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo<AuthState>(
    () => ({ session, user, role, loading, refreshRole, signOut }),
    [session, user, role, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
