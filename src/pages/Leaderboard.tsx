import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CricketShell } from "@/components/CricketShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  employee_id: string;
  full_name: string;
  user_id: string;
  total_correct: number;
  total_answered: number;
  total_duration_ms: number;
};

export default function Leaderboard() {
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("leaderboard")
      .select("employee_id, full_name, user_id, total_correct, total_answered, total_duration_ms")
      .order("total_correct", { ascending: false })
      .order("total_duration_ms", { ascending: true })
      .limit(20);

    setRows((data ?? []) as any);
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_round_attempts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_answers" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
              Ranked by total correct answers, then fastest total completion time.
            </p>
          </div>
          <div className="text-sm">
            <Link className="underline underline-offset-4" to="/">Back to tournament</Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {podium.map((p, idx) => (
            <Card key={p.user_id} className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle>
                  #{idx + 1} • {p.full_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <div>Employee ID: {p.employee_id}</div>
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
                    <TableCell>{r.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.employee_id}</TableCell>
                    <TableCell className="text-right font-medium">{r.total_correct}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {Math.round((r.total_duration_ms ?? 0) / 1000)}s
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </CricketShell>
  );
}
