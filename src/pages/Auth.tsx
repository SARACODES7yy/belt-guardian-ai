import { Auth as SupabaseAuth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const Auth = () => {
  const navigate = useNavigate();
  const { startDemo } = useAuth();

  useEffect(() => {
    // Check if user is already logged in (or in demo session)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/");
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const enterDemo = () => {
    startDemo();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold uppercase tracking-[0.06em]">
            ConveyorWatch
          </h1>
          <p className="mt-1 text-muted-foreground">AI-powered belt monitoring system</p>
        </div>

        <div className="rounded-[6px] border border-border bg-card p-8 shadow-[var(--shadow-panel)]">
          <SupabaseAuth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: "hsl(217 91% 60%)",
                    brandAccent: "hsl(217 91% 50%)",
                    inputBackground: "hsl(217 33% 17%)",
                    inputText: "hsl(210 40% 98%)",
                    inputBorder: "hsl(217 33% 20%)",
                    inputBorderFocus: "hsl(217 91% 60%)",
                  },
                },
              },
              className: {
                container: "auth-container",
                button: "auth-button",
                input: "auth-input",
              },
            }}
            providers={[]}
            redirectTo={window.location.origin}
          />

          <Button
            className="mt-4 w-full gap-2"
            variant="outline"
            onClick={enterDemo}
          >
            Continue to demo workspace
          </Button>

          <div className="mt-6 p-4 bg-status-info/10 border border-status-info/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-status-info flex-shrink-0 mt-0.5" />
            <div className="text-sm text-status-info-foreground">
              <p className="font-semibold mb-1">Demo Access</p>
              <p className="text-status-info-foreground/80">
                Email confirmation is disabled for testing. You can sign up and login immediately.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
