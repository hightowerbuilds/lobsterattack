import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import {
  ensureClawProfile,
  fetchProfile,
  getSupabaseBrowserClient,
  getSupabaseConfig,
  signInClaw,
  signOutClaw,
  type ClawProfile,
} from "./claws";

type AuthContextValue = {
  configured: boolean;
  client: SupabaseClient | null;
  session: Session | null;
  user: User | null;
  profile: ClawProfile | null;
  loading: boolean;
  signIn: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const configured = Boolean(getSupabaseConfig());
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ClawProfile | null>(null);
  const [loading, setLoading] = useState(configured);

  const syncSession = useEffectEvent(async (nextSession: Session | null) => {
    startTransition(() => {
      setSession(nextSession);
      setLoading(Boolean(client));
    });

    if (!client || !nextSession?.user) {
      startTransition(() => {
        setProfile(null);
        setLoading(false);
      });
      return;
    }

    await ensureClawProfile(client, nextSession.user);
    const { profile: nextProfile } = await fetchProfile(client, nextSession.user.id);

    startTransition(() => {
      setProfile(nextProfile);
      setLoading(false);
    });
  });

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }

    void client.auth.getSession().then(({ data }) => {
      void syncSession(data.session);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [client, syncSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      client,
      session,
      user: session?.user ?? null,
      profile,
      loading,
      async signIn(email) {
        if (!client) {
          return { error: new Error("Supabase is not configured.") };
        }

        const { error } = await signInClaw(client, email);
        return {
          error: error ?? null,
        };
      },
      async signOut() {
        if (!client) {
          return { error: new Error("Supabase is not configured.") };
        }

        const { error } = await signOutClaw(client);
        return {
          error: error ?? null,
        };
      },
    }),
    [client, configured, loading, profile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useSupabaseAuth must be used within SupabaseAuthProvider");
  }

  return context;
}
