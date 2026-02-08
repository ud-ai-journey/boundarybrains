import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin(userId: string | null | undefined) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!userId) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (cancelled) return;

      if (error) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(Boolean(data));
      setLoading(false);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return useMemo(() => ({ isAdmin, loading }), [isAdmin, loading]);
}
