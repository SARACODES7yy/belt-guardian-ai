import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Enums } from "@/integrations/supabase/types";

export const useRole = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Enums<"app_role">[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    if (user.id === "00000000-0000-4000-8000-0000000000ff") {
      // Demo operator: not in user_roles table, grant operator access locally
      setRoles(["operator"]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role");
      if (!cancelled) {
        setRoles((data ?? []).map((r) => r.role as Enums<"app_role">));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return {
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isOperator: roles.includes("operator"),
    canManage: roles.includes("admin") || roles.includes("operator"),
  };
};