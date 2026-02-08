import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CricketShell } from "@/components/CricketShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/useSession";

type RoundRow = {
  id: string;
  round_no: number;
  title: string;
  topic_preview: string | null;
  status: "locked" | "unlocked" | "closed";
  unlocked_at: string | null;
  closed_at: string | null;
};

export default function AdminDashboard() {
  const { user, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [busyRoundId, setBusyRoundId] = useState<string | null>(null);

  const canRender = useMemo(() => !sessionLoading, [sessionLoading]);

  useEffect(() => {
    if (!canRender) return;
    if (!user) {
      navigate("/admin");
      return;
    }

    let cancelled = false;

    const checkAdmin = async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!cancelled) {
        if (error) {
          setIsAdmin(false);
          return;
        }
        setIsAdmin(Boolean(data));
      }
    };

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [user, canRender, navigate]);

  const loadRounds = async () => {
    const { data, error } = await supabase
      .from("quiz_rounds")
      .select("id, round_no, title, topic_preview, status, unlocked_at, closed_at")
      .order("round_no", { ascending: true });

    if (error) {
      toast({ title: "Failed to load rounds", description: error.message, variant: "destructive" });
      return;
    }
    setRounds((data ?? []) as any);
  };

  useEffect(() => {
    if (isAdmin) loadRounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin-rounds")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quiz_rounds" },
        () => loadRounds()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const setRoundStatus = async (roundId: string, status: RoundRow["status"]) => {
    setBusyRoundId(roundId);
    try {
      const patch: any = { status };
      if (status === "unlocked") patch.unlocked_at = new Date().toISOString();
      if (status === "closed") patch.closed_at = new Date().toISOString();

      const { error } = await supabase.from("quiz_rounds").update(patch).eq("id", roundId);
      if (error) throw error;

      toast({ title: "Updated", description: `Round ${status}` });
    } catch (err: any) {
      toast({ title: "Update failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusyRoundId(null);
    }
  };

  return (
    <CricketShell>
      <section className="container py-10">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Admin dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Unlock rounds, close submissions, and monitor progress.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/leaderboard">Open leaderboard</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/admin");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>

        {isAdmin === false && (
          <Card>
            <CardHeader>
              <CardTitle>Access not granted</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Your account is authenticated, but it’s not marked as an admin in the backend roles table.
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card className="bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Rounds</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Round</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rounds.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">#{r.round_no}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.title}</div>
                        {r.topic_preview ? <div className="text-xs text-muted-foreground">{r.topic_preview}</div> : null}
                      </TableCell>
                      <TableCell className="capitalize">{r.status}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            size="sm"
                            variant={r.status === "unlocked" ? "secondary" : "default"}
                            disabled={busyRoundId === r.id}
                            onClick={() => setRoundStatus(r.id, "unlocked")}
                          >
                            Unlock
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyRoundId === r.id}
                            onClick={() => setRoundStatus(r.id, "locked")}
                          >
                            Lock
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busyRoundId === r.id}
                            onClick={() => setRoundStatus(r.id, "closed")}
                          >
                            Close
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 text-xs text-muted-foreground">
                Tip: “Close” ends the round for submissions; “Lock” hides it from employees.
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </CricketShell>
  );
}
