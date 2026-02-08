import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";

import { CricketShell } from "@/components/CricketShell";
import boundaryBrainsLogo from "@/assets/boundary-brains-logo.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Mode = "signin" | "signup";

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

export default function AuthAdmin() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => email && password, [email, password]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast({ title: "Invalid credentials", description: "Check email and password", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/admin`;
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;

        toast({
          title: "Check your email",
          description: "Confirm the email address, then come back here and sign in.",
        });
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) throw error;
      navigate("/admin/dashboard");
    } catch (err: any) {
      toast({
        title: mode === "signup" ? "Admin sign-up failed" : "Admin sign-in failed",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <CricketShell>
      <section className="container py-10 md:py-14">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-4">
            <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">Admin portal</h1>
            <p className="text-pretty text-muted-foreground">
              Organizers only. Sign in to unlock rounds and view live results.
            </p>
          </div>

          <Card className="bg-card/70 backdrop-blur">
            <CardHeader>
              <div className="flex items-center gap-3">
                <img
                  src={boundaryBrainsLogo}
                  alt="Boundary Brains logo"
                  className="h-10 w-10 shrink-0"
                  loading="eager"
                  decoding="async"
                />
                <div className="leading-tight">
                  <div className="text-sm font-semibold tracking-wide text-foreground">BOUNDARY BRAINS</div>
                  <div className="text-xs text-muted-foreground">SCS-AUTOPAY SMART QUIZ 2026</div>
                </div>
              </div>
              <div className="pt-2">
                <CardTitle>{mode === "signup" ? "Create admin account" : "Sign in"}</CardTitle>
                <CardDescription>
                  {mode === "signup" ? "You’ll need to confirm the email before signing in." : "Admin credentials only."}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button className="w-full" type="submit" disabled={!canSubmit || loading}>
                  {loading ? (mode === "signup" ? "Creating…" : "Signing in…") : mode === "signup" ? "Create account" : "Continue"}
                </Button>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
                  >
                    {mode === "signin" ? "Need an admin account?" : "Already have an account?"}
                  </button>
                  <Link className="underline underline-offset-4" to="/auth">
                    Employee sign-in
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </CricketShell>
  );
}
