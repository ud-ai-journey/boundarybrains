import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

import { CricketShell } from "@/components/CricketShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSession } from "@/hooks/useSession";

type SmokeStatus = "idle" | "running" | "pass" | "fail";

type SmokeCheck = {
  id: string;
  name: string;
  expected: string;
  status: SmokeStatus;
  details?: string;
};

function statusBadgeVariant(status: SmokeStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "pass":
      return "default";
    case "fail":
      return "destructive";
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}

export default function AdminSecuritySmoke() {
  const navigate = useNavigate();
  const { user, loading: sessionLoading } = useSession();
  const { isAdmin, loading: adminLoading } = useIsAdmin(user?.id);

  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<SmokeCheck[]>([
    {
      id: "authz_answer_keys_anon",
      name: "Answer keys are NOT publicly readable",
      expected: "Anonymous (logged-out) reads must be denied",
      status: "idle",
    },
    {
      id: "authz_answer_keys_current",
      name: "Answer keys readable only by admins",
      expected: "This admin session can read (non-admin should be denied)",
      status: "idle",
    },
    {
      id: "authz_round_history_anon",
      name: "Round results are NOT publicly readable",
      expected: "Anonymous (logged-out) reads must be denied",
      status: "idle",
    },
  ]);

  const anonClient = useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

    if (!url || !key) return null;

    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }, []);

  const setCheck = useCallback((id: string, patch: Partial<SmokeCheck>) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const run = useCallback(async () => {
    if (!anonClient) {
      setChecks((prev) =>
        prev.map((c) => ({
          ...c,
          status: "fail",
          details: "Missing backend URL/key in environment; cannot run smoke checks.",
        }))
      );
      return;
    }

    setRunning(true);
    setChecks((prev) => prev.map((c) => ({ ...c, status: "running", details: undefined })));

    // 1) Anonymous must not read answer keys
    try {
      const { error } = await anonClient.from("quiz_question_answers").select("question_id, correct_option").limit(1);
      setCheck("authz_answer_keys_anon", {
        status: error ? "pass" : "fail",
        details: error ? `Denied as expected: ${error.message}` : "Unexpectedly readable without login.",
      });
    } catch (e: any) {
      setCheck("authz_answer_keys_anon", {
        status: "pass",
        details: `Denied as expected: ${e?.message ?? "request threw"}`,
      });
    }

    // 2) Current session: admin should be able to read answer keys
    try {
      const { error } = await supabase.from("quiz_question_answers").select("question_id").limit(1);
      setCheck("authz_answer_keys_current", {
        status: error ? "fail" : "pass",
        details: error ? `Denied (unexpected for admin): ${error.message}` : "Readable for admin session (expected).",
      });
    } catch (e: any) {
      setCheck("authz_answer_keys_current", {
        status: "fail",
        details: e?.message ?? "request threw",
      });
    }

    // 3) Anonymous must not read round leaderboard rows
    try {
      const { error } = await anonClient
        .from("round_leaderboard_rows")
        .select("round_id, user_id, total_correct")
        .limit(1);
      setCheck("authz_round_history_anon", {
        status: error ? "pass" : "fail",
        details: error ? `Denied as expected: ${error.message}` : "Unexpectedly readable without login.",
      });
    } catch (e: any) {
      setCheck("authz_round_history_anon", {
        status: "pass",
        details: `Denied as expected: ${e?.message ?? "request threw"}`,
      });
    }

    setRunning(false);
  }, [anonClient, setCheck]);

  // Guard: admin-only page
  if (sessionLoading || adminLoading) {
    return (
      <CricketShell>
        <section className="container py-10">
          <Card className="mx-auto max-w-3xl bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Security smoke tests</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
          </Card>
        </section>
      </CricketShell>
    );
  }

  if (!user) {
    navigate("/admin");
    return null;
  }

  if (!isAdmin) {
    navigate("/admin");
    return null;
  }

  return (
    <CricketShell>
      <section className="container py-10">
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Security smoke tests</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Quick checks to confirm restricted tables aren’t readable without proper permissions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/admin/dashboard")}>
              Back to admin
            </Button>
            <Button type="button" onClick={run} disabled={running}>
              {running ? "Running…" : "Run checks"}
            </Button>
          </div>
        </div>

        <Card className="bg-card/70 backdrop-blur">
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(c.status)}>
                        {c.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.expected}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.details ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 text-xs text-muted-foreground">
              Note: To verify the “non-admin authenticated” case, open the employee app in a separate browser/profile,
              sign in as a regular employee, and confirm they cannot query answer keys (they should never be exposed in UI).
            </div>
          </CardContent>
        </Card>
      </section>
    </CricketShell>
  );
}
