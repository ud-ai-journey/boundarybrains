import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { CricketShell } from "@/components/CricketShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/useSession";

const answerSchema = z.object({
  option: z.enum(["A", "B", "C", "D"]),
});

type RoundRow = { id: string; round_no: number; title: string; status: "locked" | "unlocked" | "closed" };

type QuestionRow = {
  id: string;
  sort_order: number;
  prompt: string;
  image_url: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

export default function RoundPlay() {
  const { roundNo } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: sessionLoading } = useSession();

  const [round, setRound] = useState<RoundRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [questionsState, setQuestionsState] = useState<"idle" | "loading" | "ready" | "empty">("idle");
  const [index, setIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [attemptState, setAttemptState] = useState<"idle" | "loading" | "active" | "completed">("idle");
  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [saving, setSaving] = useState(false);

  const startedAtRef = useRef<number | null>(null);
  const warningsRef = useRef(0);

  const current = questions[index];
  const progress = useMemo(() => (questions.length ? ((index + 1) / questions.length) * 100 : 0), [index, questions.length]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      navigate("/auth");
    }
  }, [sessionLoading, user, navigate]);

  const load = async () => {
    const no = Number(roundNo);
    if (!Number.isFinite(no)) {
      navigate("/");
      return;
    }

    setQuestions([]);
    setIndex(0);
    setQuestionsState("loading");

    const { data: r, error: rErr } = await supabase
      .from("quiz_rounds")
      .select("id, round_no, title, status")
      .eq("round_no", no)
      .maybeSingle();
    if (rErr) {
      toast({ title: "Unable to load round", description: rErr.message, variant: "destructive" });
      setQuestionsState("idle");
      return;
    }

    if (!r) {
      toast({ title: "Round not found", description: "Check the round number" });
      navigate("/");
      return;
    }

    setRound(r as any);

    if (r.status !== "unlocked") {
      setLocked(true);
      setQuestionsState("idle");
      return;
    }

    const { data: qs, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id, sort_order, prompt, image_url, option_a, option_b, option_c, option_d")
      .eq("round_id", r.id)
      .order("sort_order", { ascending: true });

    if (qErr) {
      toast({ title: "Unable to load questions", description: qErr.message, variant: "destructive" });
      setQuestionsState("idle");
      return;
    }

    const list = (qs ?? []) as any[];
    setQuestions(list as any);
    setQuestionsState(list.length === 0 ? "empty" : "ready");
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundNo]);

  useEffect(() => {
    if (!round?.id || !user) return;
    if (locked) return;

    let cancelled = false;

    const ensureAttempt = async () => {
      setAttemptState("loading");

      // Fetch fresh state to prevent re-attempting a completed round.
      const { data: existing, error: existingErr } = await supabase
        .from("quiz_round_attempts")
        .select("started_at, completed_at")
        .eq("user_id", user.id)
        .eq("round_id", round.id)
        .maybeSingle();

      if (cancelled) return;

      if (existingErr) {
        toast({ title: "Unable to start attempt", description: existingErr.message, variant: "destructive" });
        setAttemptState("idle");
        return;
      }

      if (existing?.completed_at) {
        setAttemptState("completed");
        return;
      }

      if (!existing) {
        const startedAtIso = new Date().toISOString();
        const { error: insertErr } = await supabase.from("quiz_round_attempts").insert({
          user_id: user.id,
          round_id: round.id,
          started_at: startedAtIso,
        });

        if (!cancelled && insertErr) {
          toast({ title: "Unable to start attempt", description: insertErr.message, variant: "destructive" });
          setAttemptState("idle");
          return;
        }

        startedAtRef.current = Date.parse(startedAtIso);
        setAttemptState("active");
        return;
      }

      startedAtRef.current = existing.started_at ? Date.parse(existing.started_at) : Date.now();
      setAttemptState("active");
    };

    ensureAttempt();

    return () => {
      cancelled = true;
    };
  }, [round?.id, user, locked, toast]);

  // Light anti-cheat: warn on tab switch.
  useEffect(() => {
    if (locked) return;
    const warn = () => {
      warningsRef.current += 1;
      toast({
        title: "Tab switch detected",
        description: "Please stay on the quiz tab during the round.",
      });

      if (round?.id && user) {
        supabase
          .from("quiz_round_attempts")
          .update({ tab_switch_warnings: warningsRef.current })
          .eq("user_id", user.id)
          .eq("round_id", round.id)
          .then(() => {});
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") warn();
    };

    window.addEventListener("blur", warn);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("blur", warn);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [toast, round?.id, user, locked]);

  const finish = async () => {
    if (!round?.id || !user) return;
    if (attemptState !== "active") return;

    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : null;

    await supabase
      .from("quiz_round_attempts")
      .update({ completed_at: new Date().toISOString(), duration_ms: durationMs })
      .eq("user_id", user.id)
      .eq("round_id", round.id);

    setAttemptState("completed");
    navigate("/leaderboard");
  };

  const choose = async (opt: "A" | "B" | "C" | "D") => {
    if (!round?.id || !user || !current) return;
    if (attemptState !== "active") return;
    if (saving) return;

    const parsed = answerSchema.safeParse({ option: opt });
    if (!parsed.success) return;

    setSelected(opt);
    setSaving(true);

    const { error } = await supabase.from("quiz_answers").upsert(
      {
        user_id: user.id,
        round_id: round.id,
        question_id: current.id,
        selected_option: opt,
        answered_at: new Date().toISOString(),
      },
      { onConflict: "user_id,question_id" }
    );

    if (error) {
      toast({ title: "Could not save answer", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    window.setTimeout(() => {
      setSaving(false);
      setSelected(null);

      if (index + 1 >= questions.length) {
        finish();
      } else {
        setIndex((v) => v + 1);
      }
    }, 650);
  };

  if (locked) {
    return (
      <CricketShell>
        <section className="container py-10">
          <Card className="mx-auto max-w-2xl bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Round locked</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              This round isn’t unlocked yet (or it has been closed). Please return to the waiting screen.
              <div>
                <Button type="button" variant="outline" onClick={() => navigate("/")}>Back</Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </CricketShell>
    );
  }

  if (attemptState === "loading" || attemptState === "idle" || questionsState === "loading") {
    return (
      <CricketShell>
        <section className="container py-10">
          <Card className="mx-auto max-w-2xl bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Preparing your round…</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Please wait a moment.</CardContent>
          </Card>
        </section>
      </CricketShell>
    );
  }

  if (questionsState === "empty") {
    return (
      <CricketShell>
        <section className="container py-10">
          <Card className="mx-auto max-w-2xl bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>No questions for this round</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              This round is unlocked, but no questions have been added yet. Please ask an organizer to seed questions for Round {round?.round_no}.
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => navigate("/")}>Back to tournament</Button>
                <Button type="button" onClick={() => navigate("/leaderboard")}>View leaderboard</Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </CricketShell>
    );
  }

  if (attemptState === "completed") {
    return (
      <CricketShell>
        <section className="container py-10">
          <Card className="mx-auto max-w-2xl bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Round already completed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              You’ve already completed this round. For fairness, re-attempts are disabled.
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => navigate("/")}>Back to tournament</Button>
                <Button type="button" onClick={() => navigate("/leaderboard")}>View leaderboard</Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </CricketShell>
    );
  }

  return (
    <CricketShell>
      <section className="container py-10">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Round {round?.round_no}</div>
              <h1 className="text-2xl font-semibold tracking-tight">{round?.title}</h1>
            </div>
            <Button variant="ghost" type="button" onClick={() => navigate("/")}> 
              Exit
            </Button>
          </div>

          <Progress value={progress} />
          <div className="text-xs text-muted-foreground">
            Question {Math.min(index + 1, questions.length)} of {questions.length}
          </div>

          {current ? (
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-balance">{current.prompt}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {current.image_url ? (
                  <img
                    src={current.image_url}
                    alt="Question visual"
                    loading="lazy"
                    className="h-auto w-full rounded-md border"
                  />
                ) : null}

                <div className="grid gap-2">
                  {(
                    [
                      ["A", current.option_a],
                      ["B", current.option_b],
                      ["C", current.option_c],
                      ["D", current.option_d],
                    ] as const
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      variant={selected === key ? "hero" : "outline"}
                      className="justify-start"
                      disabled={saving}
                      onClick={() => choose(key)}
                    >
                      <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-xs font-semibold">
                        {key}
                      </span>
                      <span className="text-left">{label}</span>
                    </Button>
                  ))}
                </div>

                <div className="text-xs text-muted-foreground">
                  Your selection is recorded immediately (no correctness is shown during play).
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle>Loading questions…</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                If this takes too long, ask an organizer to confirm the round is unlocked and questions are loaded.
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </CricketShell>
  );
}
