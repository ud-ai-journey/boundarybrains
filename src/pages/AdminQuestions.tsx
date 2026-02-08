import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { CricketShell } from "@/components/CricketShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/useSession";
import { useIsAdmin } from "@/hooks/useIsAdmin";

type RoundRow = {
  id: string;
  round_no: number;
  title: string;
  status: "locked" | "unlocked" | "closed";
};

type QuestionType = "mcq" | "text";

type QuestionRow = {
  id: string;
  round_id: string;
  sort_order: number;
  question_type: QuestionType;
  prompt: string;
  image_url: string | null;
  video_url: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

const mcqSchema = z.object({
  question_type: z.literal("mcq"),
  prompt: z.string().trim().min(5).max(500),
  option_a: z.string().trim().min(1).max(160),
  option_b: z.string().trim().min(1).max(160),
  option_c: z.string().trim().min(1).max(160),
  option_d: z.string().trim().min(1).max(160),
  correct_option: z.enum(["A", "B", "C", "D"]),
  image_url: z.string().trim().url().max(2000).nullable().optional(),
  video_url: z.string().trim().url().max(2000).nullable().optional(),
});

const textSchema = z.object({
  question_type: z.literal("text"),
  prompt: z.string().trim().min(5).max(500),
  // Newline or comma separated
  variants_raw: z.string().trim().min(1).max(2000),
  image_url: z.string().trim().url().max(2000).nullable().optional(),
  video_url: z.string().trim().url().max(2000).nullable().optional(),
});

const questionSchema = z.discriminatedUnion("question_type", [mcqSchema, textSchema]);

type QuestionForm = z.infer<typeof questionSchema>;

function extFromName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function parseVariants(raw: string) {
  const parts = raw
    .split(/\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  return uniq.slice(0, 20); // cap
}

async function uploadToQuizMedia(file: File, folder: string) {
  const ext = extFromName(file.name) || "bin";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${crypto.randomUUID()}.${ext}-${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from("quiz-media")
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from("quiz-media").getPublicUrl(path);
  return data.publicUrl;
}

export default function AdminQuestions() {
  const { roundNo } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const { isAdmin, loading: adminLoading } = useIsAdmin(user?.id);

  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string>("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [prompt, setPrompt] = useState("");

  // MCQ fields
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [d, setD] = useState("");
  const [correct, setCorrect] = useState<"A" | "B" | "C" | "D">("A");

  // Text fields
  const [variantsRaw, setVariantsRaw] = useState("");

  // Media
  const [imageUrl, setImageUrl] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const canRender = useMemo(() => !sessionLoading && !adminLoading, [sessionLoading, adminLoading]);

  useEffect(() => {
    if (!canRender) return;
    if (!user) {
      navigate("/admin");
      return;
    }
    if (!isAdmin) return;

    const loadRounds = async () => {
      const { data, error } = await supabase
        .from("quiz_rounds")
        .select("id, round_no, title, status")
        .order("round_no", { ascending: true });
      if (error) {
        toast({ title: "Failed to load rounds", description: error.message, variant: "destructive" });
        return;
      }
      setRounds((data ?? []) as any);
    };

    loadRounds();
  }, [canRender, user, isAdmin, navigate, toast]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!roundNo) return;

    const no = Number(roundNo);
    if (!Number.isFinite(no)) return;

    const match = rounds.find((r) => r.round_no === no);
    if (match?.id) setSelectedRoundId(match.id);
  }, [roundNo, rounds, isAdmin]);

  const loadQuestions = async (roundId: string) => {
    const { data, error } = await supabase
      .from("quiz_questions")
      .select(
        "id, round_id, sort_order, question_type, prompt, image_url, video_url, option_a, option_b, option_c, option_d"
      )
      .eq("round_id", roundId)
      .order("sort_order", { ascending: true });

    if (error) {
      toast({ title: "Failed to load questions", description: error.message, variant: "destructive" });
      return;
    }

    setQuestions((data ?? []) as any);
  };

  useEffect(() => {
    if (!isAdmin) return;
    if (!selectedRoundId) {
      setQuestions([]);
      return;
    }

    loadQuestions(selectedRoundId);

    const channel = supabase
      .channel(`admin-questions:${selectedRoundId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quiz_questions", filter: `round_id=eq.${selectedRoundId}` },
        () => loadQuestions(selectedRoundId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoundId, isAdmin]);

  const resetForm = () => {
    setQuestionType("mcq");
    setPrompt("");
    setA("");
    setB("");
    setC("");
    setD("");
    setCorrect("A");
    setVariantsRaw("");
    setImageUrl("");
    setVideoUrl("");
    setImageFile(null);
    setVideoFile(null);
  };

  const buildPayload = (): QuestionForm => {
    if (questionType === "mcq") {
      return {
        question_type: "mcq",
        prompt,
        option_a: a,
        option_b: b,
        option_c: c,
        option_d: d,
        correct_option: correct,
        image_url: imageUrl ? imageUrl : null,
        video_url: videoUrl ? videoUrl : null,
      };
    }

    return {
      question_type: "text",
      prompt,
      variants_raw: variantsRaw,
      image_url: imageUrl ? imageUrl : null,
      video_url: videoUrl ? videoUrl : null,
    };
  };

  const onCreate = async () => {
    if (!selectedRoundId) {
      toast({ title: "Choose a round first" });
      return;
    }

    const parsed = questionSchema.safeParse(buildPayload());
    if (!parsed.success) {
      toast({ title: "Invalid question", description: parsed.error.issues[0]?.message ?? "Check fields", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const nextSort = (questions.at(-1)?.sort_order ?? 0) + 1;

      let finalImageUrl = parsed.data.image_url ?? null;
      let finalVideoUrl = parsed.data.video_url ?? null;

      if (imageFile) finalImageUrl = await uploadToQuizMedia(imageFile, `round-${selectedRoundId}`);
      if (videoFile) finalVideoUrl = await uploadToQuizMedia(videoFile, `round-${selectedRoundId}`);

      // Insert question
      const { data: inserted, error: insErr } = await supabase
        .from("quiz_questions")
        .insert({
          round_id: selectedRoundId,
          sort_order: nextSort,
          question_type: parsed.data.question_type,
          prompt: parsed.data.prompt,
          image_url: finalImageUrl,
          video_url: finalVideoUrl,
          option_a: parsed.data.question_type === "mcq" ? parsed.data.option_a : "",
          option_b: parsed.data.question_type === "mcq" ? parsed.data.option_b : "",
          option_c: parsed.data.question_type === "mcq" ? parsed.data.option_c : "",
          option_d: parsed.data.question_type === "mcq" ? parsed.data.option_d : "",
        })
        .select("id")
        .single();

      if (insErr) throw insErr;

      const questionId = inserted?.id;
      if (!questionId) throw new Error("Question was created but ID was not returned");

      if (parsed.data.question_type === "mcq") {
        const { error: ansErr } = await supabase
          .from("quiz_question_answers")
          .upsert({ question_id: questionId, correct_option: parsed.data.correct_option }, { onConflict: "question_id" });
        if (ansErr) throw ansErr;
      } else {
        const variants = parseVariants(parsed.data.variants_raw);
        if (variants.length === 0) {
          throw new Error("Please add at least one accepted answer (variant)");
        }

        const rows = variants.map((v) => ({ question_id: questionId, variant: v }));
        const { error: vErr } = await supabase.from("quiz_question_text_variants").insert(rows);
        if (vErr) throw vErr;
      }

      toast({ title: "Question added" });
      resetForm();
      await loadQuestions(selectedRoundId);
    } catch (err: any) {
      toast({ title: "Failed to add question", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CricketShell>
      <section className="container py-10">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Question builder</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Admins can add MCQ or short-text questions (names). Text answers are scored with fuzzy + partial matching.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/dashboard">Back to dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/leaderboard">Open leaderboard</Link>
            </Button>
          </div>
        </div>

        {!canRender ? null : isAdmin === false ? (
          <Card>
            <CardHeader>
              <CardTitle>Access not granted</CardTitle>
              <CardDescription>You’re signed in, but not an admin.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link to="/admin">Return to admin sign-in</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle>Round</CardTitle>
                <CardDescription>Select a round to manage its questions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Round</Label>
                  <Select value={selectedRoundId} onValueChange={setSelectedRoundId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select round" />
                    </SelectTrigger>
                    <SelectContent>
                      {rounds.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          Round {r.round_no} • {r.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="text-sm font-medium">Existing questions</div>
                  {selectedRoundId ? (
                    questions.length === 0 ? (
                      <div className="rounded-md border bg-background/40 p-3 text-sm text-muted-foreground">
                        No questions yet for this round.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {questions.map((q) => (
                          <div key={q.id} className="rounded-md border bg-background/40 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs text-muted-foreground">#{q.sort_order}</div>
                              <div className="text-xs text-muted-foreground capitalize">{q.question_type}</div>
                            </div>
                            <div className="mt-1 text-sm font-medium">{q.prompt}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              {q.image_url ? <span className="rounded border px-2 py-1">image</span> : null}
                              {q.video_url ? <span className="rounded border px-2 py-1">video</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="text-sm text-muted-foreground">Select a round to view questions.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle>Add a question</CardTitle>
                <CardDescription>Choose MCQ or Text answer.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Question type</Label>
                  <Select value={questionType} onValueChange={(v) => setQuestionType(v as QuestionType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mcq">MCQ (A–D)</SelectItem>
                      <SelectItem value="text">Text answer (names)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Prompt</Label>
                  <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Enter the question" />
                </div>

                {questionType === "mcq" ? (
                  <>
                    <div className="grid gap-3">
                      <div className="space-y-2">
                        <Label>Option A</Label>
                        <Input value={a} onChange={(e) => setA(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Option B</Label>
                        <Input value={b} onChange={(e) => setB(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Option C</Label>
                        <Input value={c} onChange={(e) => setC(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Option D</Label>
                        <Input value={d} onChange={(e) => setD(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Correct option</Label>
                      <Select value={correct} onValueChange={(v) => setCorrect(v as any)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label>Accepted answers (variants)</Label>
                    <Textarea
                      value={variantsRaw}
                      onChange={(e) => setVariantsRaw(e.target.value)}
                      placeholder={`One per line (or comma-separated)\nExamples:\nSachin Tendulkar\nSachin\nS. Tendulkar`}
                      rows={6}
                    />
                    <div className="text-xs text-muted-foreground">
                      Fuzzy scoring accepts partial names + minor typos. Add common variants to improve fairness.
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-3">
                  <div className="text-sm font-medium">Image (optional)</div>
                  <div className="space-y-2">
                    <Label>Image URL</Label>
                    <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
                    <div className="text-xs text-muted-foreground">Or upload a file below (upload overrides URL).</div>
                    <Input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="text-sm font-medium">Video (optional)</div>
                  <div className="space-y-2">
                    <Label>Video URL (MP4/WebM)</Label>
                    <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." />
                    <div className="text-xs text-muted-foreground">Or upload a file below (upload overrides URL).</div>
                    <Input
                      type="file"
                      accept="video/mp4,video/webm"
                      onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="button" onClick={onCreate} disabled={busy || !selectedRoundId}>
                    {busy ? "Saving…" : "Add question"}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm} disabled={busy}>
                    Reset
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground">Tip: Add at least 1 question before unlocking a round.</div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </CricketShell>
  );
}
