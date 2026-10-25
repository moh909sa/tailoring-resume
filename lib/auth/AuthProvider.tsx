import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { authConfigurationError, supabase } from "@/lib/supabase";

type AuthState = { session: Session | null; loading: boolean; error: string | null };
const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  error: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: !!supabase,
    error: authConfigurationError,
  });

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let receivedAuthEvent = false;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      if (active) setState({ session, loading: false, error: null });
    });
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && !receivedAuthEvent) {
          setState({ session: data.session, loading: false, error: error?.message ?? null });
        }
      })
      .catch(() => {
        if (active)
          setState({
            session: null,
            loading: false,
            error: "Unable to restore your sign-in. Please sign in again.",
          });
      });

    const appState =
      Platform.OS !== "web"
        ? AppState.addEventListener("change", (nextState) => {
            if (nextState === "active") client.auth.startAutoRefresh();
            else client.auth.stopAutoRefresh();
          })
        : null;
    if (Platform.OS !== "web" && AppState.currentState === "active") {
      client.auth.startAutoRefresh();
    }
    return () => {
      active = false;
      subscription.unsubscribe();
      appState?.remove();
      if (Platform.OS !== "web") client.auth.stopAutoRefresh();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
