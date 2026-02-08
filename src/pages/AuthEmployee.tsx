import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";

import { CricketShell } from "@/components/CricketShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { employeeEmailFromId, sha256Hex } from "@/lib/crypto";

const schema = z.object({
  employeeId: z
    .string()
    .trim()
    .min(3, "Employee ID is required")
    .max(32, "Employee ID too long")
    .regex(/^[a-zA-Z0-9_-]+$/, "Use letters/numbers only"),
  fullName: z.string().trim().min(2, "Name is required").max(80, "Name too long"),
  passcode: z.string().trim().min(4, "Passcode required").max(64, "Passcode too long"),
});

export default function AuthEmployee() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [employeeId, setEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => employeeId && fullName && passcode, [employeeId, fullName, passcode]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = schema.safeParse({ employeeId, fullName, passcode });
    if (!parsed.success) {
      toast({
        title: "Check your details",
        description: parsed.error.issues[0]?.message ?? "Invalid input",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const normalizedId = parsed.data.employeeId.trim();
      const normalizedName = parsed.data.fullName.trim();
      const email = employeeEmailFromId(normalizedId);
      const password = await sha256Hex(`${parsed.data.passcode}::${normalizedId}`);

      // Ensure the auth user exists + is confirmed (server-side) and that employee_id uniqueness is enforced.
      const { data: ensureData, error: ensureError } = await supabase.functions.invoke("employee-auth", {
        body: {
          employeeId: normalizedId,
          fullName: normalizedName,
          passcode: parsed.data.passcode,
        },
      });

      if (ensureError) throw ensureError;
      if (!ensureData?.ok) throw new Error(ensureData?.message ?? "Unable to sign in");

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      navigate("/");
      toast({ title: "Welcome", description: `Good luck, ${normalizedName}!` });
    } catch (err: any) {
      toast({ title: "Sign-in failed", description: err?.message ?? "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <CricketShell>
      <section className="container py-10 md:py-14">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-4">
            <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Enter the arena: Smart Quiz 2026
            </h1>
            <p className="text-pretty text-muted-foreground">
              Sign in with your Employee ID and the event passcode. You’ll stay logged in for the day.
            </p>
            <div className="rounded-lg border bg-card/60 p-4 text-sm text-muted-foreground">
              Fair play reminder: switching tabs will trigger a warning during a live round.
            </div>
          </div>

          <Card className="bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Employee sign-in</CardTitle>
              <CardDescription>Use the passcode shared by organizers.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="employeeId">Employee ID</Label>
                  <Input
                    id="employeeId"
                    autoComplete="off"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="e.g. SCS12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Employee name</Label>
                  <Input
                    id="fullName"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="passcode">Event passcode</Label>
                  <Input
                    id="passcode"
                    type="password"
                    autoComplete="off"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                <Button variant="hero" className="w-full" type="submit" disabled={!canSubmit || loading}>
                  {loading ? "Signing in…" : "Join the tournament"}
                </Button>

                <div className="text-xs text-muted-foreground">
                  Organizer? <Link className="underline underline-offset-4" to="/admin">Go to admin portal</Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </CricketShell>
  );
}
