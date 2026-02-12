import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CricketShell } from "@/components/CricketShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

type RoundRow = {
  id: string;
  round_no: number;
  title: string;
  topic_preview: string | null;
  status: "locked" | "unlocked" | "closed";
};

type ProfileRow = { employee_id: string; full_name: string };

export default function Index() {
  const { user, loading } = useSession();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rounds, setRounds] = useState<RoundRow[]>([]);

  const unlocked = useMemo(() => rounds.filter((r) => r.status === "unlocked"), [rounds]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth");
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("employee_id, full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      setProfile((p ?? null) as any);

      const { data: r } = await supabase
        .from("quiz_rounds")
        .select("id, round_no, title, topic_preview, status")
        .order("round_no", { ascending: true });
      setRounds((r ?? []) as any);
    };

    load();

    const channel = supabase
      .channel("rounds-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_rounds" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <CricketShell>
      <section className="container py-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                {profile ? `Welcome, ${profile.full_name}` : "Welcome"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Rounds unlock manually. Stay ready—your scoreboard updates live.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link to="/leaderboard">View leaderboard</Link>
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate("/auth");
                }}
              >
                Sign out
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2 bg-card/70 backdrop-blur shadow-glow border-brand-glow/30">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Live rounds</CardTitle>
                    <CardDescription>Join only when a round is unlocked.</CardDescription>
                  </div>
                  <Badge className="bg-gradient-to-r from-brand-sun via-brand-accent to-brand-glow text-primary-foreground">
                    Cricket Quiz
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {unlocked.length === 0 ? (
                  <div className="rounded-lg border bg-background/40 p-4 text-sm text-muted-foreground">
                    Waiting for organizers to unlock the next round.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {unlocked.map((r) => (
                      <div
                        key={r.id}
                        className="group flex flex-col gap-2 rounded-lg border bg-background/40 p-4 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-glow md:flex-row md:items-center md:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="bg-brand-accent/15 text-secondary-foreground">
                              Round {r.round_no}
                            </Badge>
                            <Badge className="bg-brand-glow/15 text-secondary-foreground">Unlocked</Badge>
                          </div>
                          <div className="font-medium">{r.title}</div>
                          {r.topic_preview ? (
                            <div className="text-sm text-muted-foreground">{r.topic_preview}</div>
                          ) : null}
                        </div>
                        <Button variant="hero" onClick={() => navigate(`/round/${r.round_no}`)}>
                          Start round
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="text-xs text-muted-foreground">
                  Fair play: switching tabs during a round triggers a warning.
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/70 backdrop-blur shadow-accent border-brand-accent/30">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Today’s schedule</CardTitle>
                    <CardDescription>Rounds appear here once seeded.</CardDescription>
                  </div>
                  <Badge variant="outline" className="border-brand-sun/40 bg-brand-sun/10 text-secondary-foreground">
                    Fixture
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {rounds.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No rounds yet. Ask an organizer to set them up.</div>
                ) : (
                  rounds.map((r) => (
                    <div
                      key={r.id}
                      className="group flex items-center justify-between rounded-md border bg-background/40 px-3 py-2 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-accent"
                    >
                      <div className="text-sm">
                        <span className="font-medium">#{r.round_no}</span> {r.title}
                      </div>
                      <Badge
                        variant={r.status === "unlocked" ? "default" : r.status === "closed" ? "secondary" : "outline"}
                        className={
                          r.status === "unlocked"
                            ? "bg-brand-glow text-primary-foreground"
                            : r.status === "closed"
                              ? "bg-brand-sun/20 text-secondary-foreground"
                              : "border-brand-accent/30 bg-brand-accent/10 text-secondary-foreground"
                        }
                      >
                        {r.status}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 text-xs text-muted-foreground">
            Organizer access: <Link className="underline underline-offset-4" to="/admin">Admin portal</Link>
          </div>
        </div>
      </section>
    </CricketShell>
  );
}
