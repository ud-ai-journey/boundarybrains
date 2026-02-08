import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { CricketShell } from "@/components/CricketShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/useSession";
import { useIsAdmin } from "@/hooks/useIsAdmin";

type RoundStatus = "locked" | "unlocked" | "closed";

type RoundRow = {
  id: string;
  round_no: number;
  title: string;
  status: RoundStatus;
  topic_preview: string | null;
};

const createSchema = z.object({
  round_no: z.coerce.number().int().min(1).max(99),
  title: z.string().trim().min(2).max(80),
  status: z.enum(["locked", "unlocked", "closed"]),
});

const editSchema = z.object({
  title: z.string().trim().min(2).max(80),
  status: z.enum(["locked", "unlocked", "closed"]),
});

export default function AdminRounds() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const { isAdmin, loading: adminLoading } = useIsAdmin(user?.id);

  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(false);

  const [roundNo, setRoundNo] = useState<number>(1);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<RoundStatus>("locked");
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<RoundStatus>("locked");

  const canRender = useMemo(() => !sessionLoading && !adminLoading, [sessionLoading, adminLoading]);

  const loadRounds = async () => {
    setLoadingRounds(true);
    const { data, error } = await supabase
      .from("quiz_rounds")
      .select("id, round_no, title, status, topic_preview")
      .order("round_no", { ascending: true });
    setLoadingRounds(false);

    if (error) {
      toast({ title: "Failed to load rounds", description: error.message, variant: "destructive" });
      return;
    }

    setRounds((data ?? []) as any);
  };

  useEffect(() => {
    if (!canRender) return;
    if (!user) {
      navigate("/admin");
      return;
    }
    if (isAdmin) loadRounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRender, user, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel("admin-rounds-design")
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_rounds" }, loadRounds)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    // auto-suggest next round number
    const max = rounds.reduce((m, r) => Math.max(m, r.round_no), 0);
    if (!busy && roundNo <= max) setRoundNo(max + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds]);

  const onCreate = async () => {
    const parsed = createSchema.safeParse({ round_no: roundNo, title, status });
    if (!parsed.success) {
      toast({ title: "Invalid round", description: parsed.error.issues[0]?.message ?? "Check fields", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const patch: any = {
        round_no: parsed.data.round_no,
        title: parsed.data.title,
        status: parsed.data.status,
      };
      if (parsed.data.status === "unlocked") patch.unlocked_at = new Date().toISOString();
      if (parsed.data.status === "closed") patch.closed_at = new Date().toISOString();

      const { error } = await supabase.from("quiz_rounds").insert(patch);
      if (error) throw error;

      toast({ title: "Round created" });
      setTitle("");
      setStatus("locked");
      await loadRounds();
    } catch (err: any) {
      toast({ title: "Create failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (r: RoundRow) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditStatus(r.status);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditStatus("locked");
  };

  const saveEdit = async (roundId: string) => {
    const parsed = editSchema.safeParse({ title: editTitle, status: editStatus });
    if (!parsed.success) {
      toast({ title: "Invalid changes", description: parsed.error.issues[0]?.message ?? "Check fields", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const patch: any = { title: parsed.data.title, status: parsed.data.status };
      if (parsed.data.status === "unlocked") patch.unlocked_at = new Date().toISOString();
      if (parsed.data.status === "closed") patch.closed_at = new Date().toISOString();

      const { error } = await supabase.from("quiz_rounds").update(patch).eq("id", roundId);
      if (error) throw error;

      toast({ title: "Round updated" });
      cancelEdit();
      await loadRounds();
    } catch (err: any) {
      toast({ title: "Update failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const deleteRound = async (roundId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("quiz_rounds").delete().eq("id", roundId);
      if (error) throw error;
      toast({ title: "Round deleted" });
      await loadRounds();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CricketShell>
      <section className="container py-10">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Manage rounds</h1>
            <p className="mt-1 text-sm text-muted-foreground">Create rounds, set status, then add questions + correct answers.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/dashboard">Admin dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin/questions">Question builder</Link>
            </Button>
          </div>
        </div>

        {!canRender ? null : isAdmin === false ? (
          <Card>
            <CardHeader>
              <CardTitle>Access not granted</CardTitle>
              <CardDescription>Only organizers (admins) can manage rounds.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link to="/admin">Return to admin sign-in</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle>Create a round</CardTitle>
                <CardDescription>Round number must be unique.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Round number</Label>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={String(roundNo)}
                    onChange={(e) => setRoundNo(Number(e.target.value))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Legends & Records" />
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as RoundStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="locked">Locked</SelectItem>
                      <SelectItem value="unlocked">Unlocked</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="button" onClick={onCreate} disabled={busy}>
                  {busy ? "Creating…" : "Create round"}
                </Button>

                <div className="text-xs text-muted-foreground">After creating a round, use “Questions” to add content.</div>
              </CardContent>
            </Card>

            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <CardTitle>Rounds</CardTitle>
                <CardDescription>{loadingRounds ? "Loading…" : "Manage status, questions, and deletion."}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Round</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rounds.map((r) => {
                      const isEditing = editingId === r.id;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">#{r.round_no}</TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                            ) : (
                              <div className="font-medium">{r.title}</div>
                            )}
                          </TableCell>
                          <TableCell className="capitalize">
                            {isEditing ? (
                              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as RoundStatus)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="locked">Locked</SelectItem>
                                  <SelectItem value="unlocked">Unlocked</SelectItem>
                                  <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              r.status
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex flex-wrap justify-end gap-2">
                              <Button size="sm" variant="outline" asChild>
                                <Link to={`/admin/questions/${r.round_no}`}>Questions</Link>
                              </Button>

                              {isEditing ? (
                                <>
                                  <Button size="sm" onClick={() => saveEdit(r.id)} disabled={busy}>
                                    Save
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={busy}>
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <Button size="sm" variant="secondary" onClick={() => startEdit(r)} disabled={busy}>
                                  Edit
                                </Button>
                              )}

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="destructive" disabled={busy}>
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete round #{r.round_no}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will also delete all questions in the round (and their answer keys). Player answers remain, but the round content will be gone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteRound(r.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <Separator className="my-4" />

                <div className="text-xs text-muted-foreground">
                  Recommended flow: Create rounds (locked) → add questions + correct answers → unlock when ready.
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </CricketShell>
  );
}
