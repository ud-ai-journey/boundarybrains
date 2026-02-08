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

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

export default function AuthAdmin() {
  const navigate = useNavigate();
  const { toast } = useToast();

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
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) throw error;
      navigate("/admin/dashboard");
    } catch (err: any) {
      toast({ title: "Admin sign-in failed", description: err?.message ?? "Try again", variant: "destructive" });
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
              Organizers only. Use your admin email/password to unlock rounds and view live results.
            </p>
          </div>

          <Card className="bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Admin credentials only.</CardDescription>
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
                  {loading ? "Signing in…" : "Continue"}
                </Button>
                <div className="text-xs text-muted-foreground">
                  Employee? <Link className="underline underline-offset-4" to="/auth">Go to employee sign-in</Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </CricketShell>
  );
}
