import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

const emailSchema = z.string().email("Enter a valid email");
const passwordSchema = z.string().min(8, "Minimum 8 characters");

type Role = "patient" | "doctor";

function RoleToggle({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border bg-background/60 p-1">
      <button
        type="button"
        onClick={() => onChange("patient")}
        className={`rounded-md px-3 py-2 text-sm font-medium transition ${
          value === "patient" ? "bg-accent text-accent-foreground shadow-soft" : "hover:bg-accent/60"
        }`}
      >
        Patient
      </button>
      <button
        type="button"
        onClick={() => onChange("doctor")}
        className={`rounded-md px-3 py-2 text-sm font-medium transition ${
          value === "doctor" ? "bg-accent text-accent-foreground shadow-soft" : "hover:bg-accent/60"
        }`}
      >
        Doctor
      </button>
    </div>
  );
}

export default function AuthPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<Role>("patient");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [busy, setBusy] = useState(false);

  const subtitle = useMemo(
    () =>
      tab === "login"
        ? "Secure sign-in for patients and clinicians."
        : "Create your account and choose your role — permissions are enforced server-side.",
    [tab],
  );

  const afterAuthRedirect = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const nextRole = (data?.role as Role | undefined) ?? "patient";
    nav(nextRole === "doctor" ? "/doctor" : "/patient", { replace: true });
  };

  const onLogin = async () => {
    setBusy(true);
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user?.id) await afterAuthRedirect(data.user.id);
    } catch (e: any) {
      toast({ title: "Login failed", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onSignup = async () => {
    setBusy(true);
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);

      const redirectUrl = `${window.location.origin}/`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl },
      });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) {
        toast({ title: "Check your email", description: "Finish signup using the link we sent." });
        return;
      }

      // Create profile (non-sensitive metadata)
      await supabase.from("profiles").upsert({
        user_id: userId,
        full_name: fullName || null,
        specialization: role === "doctor" ? specialization || null : null,
      });

      // Create role record (security requirement)
      const { error: roleErr } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (roleErr) throw roleErr;

      if (role === "doctor") {
        await supabase.from("doctor_availability").upsert({ doctor_id: userId, is_available: true });
      }

      toast({
        title: "Account created",
        description: "You’re in — welcome to Smart Healthcare.",
      });

      await afterAuthRedirect(userId);
    } catch (e: any) {
      toast({ title: "Signup failed", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-10">
        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl border bg-card/70 p-8 shadow-card backdrop-blur-sm animate-fade-in">
            <div className="absolute inset-0 opacity-60 motion-safe:animate-glow-drift">
              <div className="h-full w-full bg-hero" />
            </div>
            <div className="relative">
              <h1 className="font-display text-3xl font-semibold tracking-tight">Smart Healthcare</h1>
              <p className="mt-2 text-muted-foreground">
                AI risk prediction, consent-based sharing, telemedicine, and blockchain-style verification — built as a clean MVP.
              </p>
              <div className="mt-8 grid gap-3">
                {[
                  "AI prediction with history + trends",
                  "Consent-based doctor access (server enforced)",
                  "Telemedicine appointments + chat",
                  "Ledger-style record verification + QR",
                ].map((t) => (
                  <div key={t} className="rounded-lg border bg-background/50 px-4 py-3 shadow-soft">
                    <div className="text-sm">{t}</div>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-xs text-muted-foreground">
                Tip: For testing, email confirmation is already disabled in the backend settings.
              </p>
            </div>
          </div>

          <Card className="border bg-card/70 shadow-card backdrop-blur-sm animate-fade-in">
            <CardHeader>
              <CardTitle className="font-display">{tab === "login" ? "Sign in" : "Create account"}</CardTitle>
              <CardDescription>{subtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>

                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                    />
                  </div>

                  <TabsContent value="signup" className="m-0 space-y-4">
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <RoleToggle value={role} onChange={setRole} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full name</Label>
                      <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Optional" />
                    </div>

                    {role === "doctor" ? (
                      <div className="space-y-2">
                        <Label htmlFor="spec">Specialization</Label>
                        <Input
                          id="spec"
                          value={specialization}
                          onChange={(e) => setSpecialization(e.target.value)}
                          placeholder="e.g., Cardiology"
                        />
                      </div>
                    ) : null}

                    <Button variant="hero" className="w-full" disabled={busy} onClick={onSignup}>
                      {busy ? "Creating…" : "Create account"}
                    </Button>
                  </TabsContent>

                  <TabsContent value="login" className="m-0 space-y-4">
                    <Button variant="hero" className="w-full" disabled={busy} onClick={onLogin}>
                      {busy ? "Signing in…" : "Sign in"}
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={busy}
                      onClick={() => {
                        setTab("signup");
                      }}
                    >
                      New here? Create an account
                    </Button>
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
