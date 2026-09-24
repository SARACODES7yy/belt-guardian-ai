import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const DEMO_FLAG = "beltwatch_demo_session";
const DEMO_USER_ID = "00000000-0000-4000-8000-0000000000ff";

const demoUser = (): User =>
  ({
    id: DEMO_USER_ID,
    email: "demo@beltwatch.app",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: { full_name: "Demo Operator" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }) as User;

const demoSession = (): Session =>
  ({
    access_token: "demo",
    refresh_token: "demo",
    token_type: "bearer",
    expires_in: 86400 * 30,
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
    user: demoUser(),
  }) as Session;

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Restore demo session from localStorage WITHOUT hitting the network
  // (Supabase signup is IP-rate-limited; demo mode bypasses it entirely)
  useEffect(() => {
    if (localStorage.getItem(DEMO_FLAG)) {
      setSession(demoSession());
      setUser(demoUser());
      setLoading(false);
      return;
    }

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const startDemo = () => {
    localStorage.setItem(DEMO_FLAG, "1");
    setSession(demoSession());
    setUser(demoUser());
    navigate("/");
  };

  const signOut = async () => {
    localStorage.removeItem(DEMO_FLAG);
    if (session && session.access_token !== "demo") {
      await supabase.auth.signOut();
    }
    setSession(null);
    setUser(null);
    navigate("/auth");
  };

  return {
    user,
    session,
    loading,
    signedIn: !!user,
    isDemo: !!user && user.id === DEMO_USER_ID,
    startDemo,
    signOut,
  };
};
