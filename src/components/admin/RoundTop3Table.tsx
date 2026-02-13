import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type RoundTopRow = {
  user_id: string;
  employee_id: string | null;
  full_name: string | null;
  total_correct: number;
  total_answered: number;
  duration_ms: number | null;
  completed_at: string | null;
};

export type RoundTop3 = {
  round_id: string;
  round_no: number;
  round_title: string;
  rows: RoundTopRow[];
};

function formatDuration(durationMs: number | null) {
  if (durationMs == null) return "—";
  return `${Math.round(durationMs / 1000)}s`;
}

function formatCompletedAt(completedAt: string | null) {
  if (!completedAt) return "—";
  const d = new Date(completedAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function RoundTop3Cards({ items }: { items: RoundTop3[] }) {
  if (!items.length) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((it) => (
        <Card key={it.round_id} className="bg-card/70 backdrop-blur">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center justify-between gap-3">
              <span>
                Round {it.round_no}: {it.round_title}
              </span>
              <Badge variant="secondary">Top 3</Badge>
            </CardTitle>
            <div className="text-xs text-muted-foreground">Ranked by correct answers, then fastest time.</div>
          </CardHeader>
          <CardContent>
            {it.rows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Rank</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead className="text-right">Correct</TableHead>
                    <TableHead className="text-right">Answered</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {it.rows.map((r, idx) => (
                    <TableRow key={r.user_id}>
                      <TableCell className="font-medium">
                        <Badge variant={idx === 0 ? "default" : "secondary"}>#{idx + 1}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.employee_id ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">{r.total_correct}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.total_answered}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDuration(r.duration_ms)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCompletedAt(r.completed_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-sm text-muted-foreground">No submissions yet.</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
