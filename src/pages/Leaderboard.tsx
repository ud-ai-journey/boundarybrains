import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { CricketShell } from "@/components/CricketShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

type Round = {
  id: string;
  round_no: number;
  title: string;
};

type Row = {
  employee_id: string | null;
  full_name: string | null;
  user_id: string;
  total_correct: number;
  total_answered: number;
  duration_ms: number | null;
};

const POLL_MS = 3000;

export default function Leaderboard() {
  const [round, setRound] = useState<Round | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadingRef = useRef(false);

  const load = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      // Always scope to the currently unlocked round (per-round leaderboard).
      const { data: unlockedRound, error: roundError } = await supabase
        .from("quiz_rounds")
        .select("id, round_no, title")
        .eq("status", "unlocked")
        .order("unlocked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (roundError) return;

      if (!unlockedRound) {
        setRound(null);
        setRows([]);
        setLastUpdatedAt(new Date());
        return;
      }

      setRound(unlockedRound as Round);

      const { data, error } = await supabase
        .from("round_leaderboard_rows")
        .select("employee_id, full_name, user_id, total_correct, total_answered, duration_ms")
        .eq("round_id", unlockedRound.id)
        .order("total_correct", { ascending: false })
        .order("duration_ms", { ascending: true, nullsFirst: false })
        .limit(20);

      if (!error) {
        setRows((data ?? []) as Row[]);
        setLastUpdatedAt(new Date());
      }
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    load();

    const id = window.setInterval(load, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const podium = useMemo(() => rows.slice(0, 3), [rows]);

  return (
    <CricketShell>
      <section className="container py-10">
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Live leaderboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {round ? (
                <>
                  Round {round.round_no}: {round.title}
                </>
              ) : (
                <>No round is currently unlocked.</>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Updates every {Math.round(POLL_MS / 1000)}s
              {lastUpdatedAt ? ` • Last updated ${lastUpdatedAt.toLocaleTimeString()}` : ""}
            </p>
          </div>
          <div className="text-sm">
            <Link className="underline underline-offset-4" to="/">
              Back to tournament
            </Link>
          </div>
        </div>

        {round ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {podium.map((p, idx) => (
                <Card key={p.user_id} className="bg-card/70 backdrop-blur">
                  <CardHeader>
                    <CardTitle>
                      #{idx + 1} • {p.full_name ?? "—"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <div>Employee ID: {p.employee_id ?? "—"}</div>
                    <div>
                      Score: <span className="font-medium text-foreground">{p.total_correct}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="mt-6 bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle>Top 20</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[70px]">Rank</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Employee ID</TableHead>
                      <TableHead className="text-right">Correct</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={r.user_id}>
                        <TableCell className="font-medium">{i + 1}</TableCell>
                        <TableCell>{r.full_name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.employee_id ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium">{r.total_correct}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.duration_ms == null ? "—" : `${Math.round(r.duration_ms / 1000)}s`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : null}
      </section>
    </CricketShell>
  );
}

