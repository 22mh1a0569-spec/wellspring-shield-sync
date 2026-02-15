import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Stethoscope, User } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { HealthChainBrand } from "@/components/HealthChainBrand";

const emailSchema = z.string().trim().email("Enter a valid email").max(255, "Email is too long");
const passwordSchema = z.string().min(8, "Minimum 8 characters").max(128, "Password is too long");

type Role = "patient" | "doctor";

type FormNotice =
  | {
      variant: "default" | "destructive";
      title: string;
      description?: string;
    }
  | null;

function humanizeError(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues?.[0]?.message ?? "Please check your inputs.";

  const anyErr = err as any;
  const msg = (anyErr?.message ?? anyErr?.error_description ?? anyErr?.error ?? "").toString();

  if (!msg) return "Something went wrong. Please try again.";

  // Common auth messages → user-friendly copy
  if (msg.toLowerCase().includes("invalid login credentials")) return "Incorrect email or password.";
  if (msg.toLowerCase().includes("user already registered")) return "This email is already registered. Please sign in.";
  if (msg.toLowerCase().includes("password should be at least")) return "Password must be at least 8 characters.";

  return msg;
}

async function fetchUserRole(userId: string): Promise<Role | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return (data?.role as Role | undefined) ?? null;
}

function RoleCard({
  active,
  title,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "flex w-full flex-col items-center justify-center gap-3 rounded-xl border p-5 text-center shadow-soft transition hover-scale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
        (active
          ? "border-primary bg-accent ring-2 ring-primary"
          : "border-border bg-card hover:bg-accent/60")
      }
    >
      <div
        className={
          "grid h-10 w-10 place-items-center rounded-full " +
          (active ? "bg-primary/10" : "bg-secondary")
        }
      >
        {icon}
      </div>
      <div className="text-sm font-semibold">{title}</div>
    </button>
  );
}

function InlineNotice({ notice }: { notice: FormNotice }) {
  if (!notice) return null;
  return (
    <Alert variant={notice.variant} className="mt-4 rounded-xl">
      <AlertTitle>{notice.title}</AlertTitle>
      {notice.description ? <AlertDescription>{notice.description}</AlertDescription> : null}
    </Alert>
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
  const [notice, setNotice] = useState<FormNotice>(null);

  const subtitle = useMemo(
    () => (tab === "login" ? "Sign in to access your health dashboard" : "Join HealthChain for secure healthcare"),
    [tab],
  );

  const afterAuthRedirect = async (userId: string) => {
    const nextRole = (await fetchUserRole(userId)) ?? "patient";
    nav(nextRole === "doctor" ? "/doctor" : "/patient", { replace: true });
  };

  const readRoleFromMetadata = (u: { user_metadata?: any } | null | undefined): Role | null => {
    const raw = u?.user_metadata?.role;
    if (raw === "patient" || raw === "doctor") return raw;
    return null;
  };

  const ensureRoleAndProfile = async (args: {
    userId: string;
    selectedRole: Role;
    authUser: any;
  }) => {
    // If role row doesn't exist (common when signup happens before email confirmation),
    // create it from immutable signup metadata.
    const existingRole = await fetchUserRole(args.userId);
    if (existingRole) return existingRole;

    const metaRole = readRoleFromMetadata(args.authUser);
    if (!metaRole) {
      throw new Error(
        "Your account is missing a role assignment. Please complete signup again (or contact support).",
      );
    }

    if (metaRole !== args.selectedRole) {
      throw new Error(
        `This account is registered as ${metaRole}. Please switch to ${metaRole} and sign in again.`,
      );
    }

    // Create role + profile from metadata (safe because user is authenticated now).
    const fullNameFromMeta = (args.authUser?.user_metadata?.full_name as string | undefined) ?? null;
    const specializationFromMeta =
      metaRole === "doctor"
        ? ((args.authUser?.user_metadata?.specialization as string | undefined) ?? null)
        : null;

    const { error: roleErr } = await supabase.from("user_roles").insert({ user_id: args.userId, role: metaRole });
    if (roleErr) throw roleErr;

    const { error: profileErr } = await supabase.from("profiles").upsert({
      user_id: args.userId,
      full_name: fullNameFromMeta,
      specialization: specializationFromMeta,
    });
    if (profileErr) throw profileErr;

    if (metaRole === "doctor") {
      const { error: availErr } = await supabase
        .from("doctor_availability")
        .upsert({ doctor_id: args.userId, is_available: true });
      if (availErr) throw availErr;
    }

    return metaRole;
  };

  const onLogin = async () => {
    setBusy(true);
    setNotice(null);
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error("Sign-in succeeded but no user was returned.");

      const resolvedRole = await ensureRoleAndProfile({ userId, selectedRole: role, authUser: data.user });
      nav(resolvedRole === "doctor" ? "/doctor" : "/patient", { replace: true });
    } catch (e: any) {
      // If we threw a role mismatch error after sign-in, sign out to avoid partial session confusion.
      const msg = humanizeError(e);
      if (msg.toLowerCase().includes("registered as")) {
        await supabase.auth.signOut().catch(() => undefined);
      }

      setNotice({
        variant: "destructive",
        title: "Sign in failed",
        description: msg,
      });
    } finally {
      setBusy(false);
    }
  };

  const onSignup = async () => {
    setBusy(true);
    setNotice(null);
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);

      const redirectUrl = `${window.location.origin}/`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          // Persist intended role/profile in auth metadata so we can finalize DB rows
          // after email confirmation (when the user is authenticated).
          data: {
            role,
            full_name: fullName || null,
            specialization: role === "doctor" ? specialization || null : null,
          },
        },
      });
      if (error) throw error;

      const userId = data.user?.id;
      // If email confirmation is enabled, there is no session yet and RLS will block DB writes.
      // We finalize `user_roles`/`profiles` on the user's first successful login.
      if (!userId || !data.session) {
        setNotice({
          variant: "default",
          title: "Check your email",
          description: "Finish signup using the link we sent, then sign in.",
        });
        return;
      }

      // If a session exists (auto-confirm), we can finalize immediately.
      const resolvedRole = await ensureRoleAndProfile({ userId, selectedRole: role, authUser: data.user });
      nav(resolvedRole === "doctor" ? "/doctor" : "/patient", { replace: true });
    } catch (e: any) {
      setNotice({
        variant: "destructive",
        title: "Sign up failed",
        description: humanizeError(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero">
      <main className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 items-center gap-10 px-6 py-10 md:grid-cols-2">
        {/* Left marketing panel */}
        <section className="animate-fade-in">
          <HealthChainBrand />

          <h1 className="mt-10 font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-foreground">
            Secure Health Records
            <br />
            with <span className="text-primary">Blockchain</span> &amp; AI
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Experience the future of healthcare with AI-powered disease prediction and tamper-proof medical records secured by
            blockchain technology.
          </p>

          <div className="mt-10 grid max-w-xl gap-4">
            {["AI Disease Risk Prediction", "Blockchain Record Verification", "Consent-Based Access Control"].map((t) => (
              <div key={t} className="flex items-center gap-4 rounded-2xl border bg-card px-5 py-5 shadow-soft">
                <div className="h-12 w-12 rounded-2xl bg-accent shadow-soft" aria-hidden="true" />
                <div className="text-base font-semibold">{t}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Right auth card */}
        <section className="animate-fade-in">
          <Card className="mx-auto w-full max-w-lg border bg-card shadow-card">
            <CardHeader className="text-center">
              <CardTitle className="font-display text-3xl font-extrabold tracking-tight">
                {tab === "login" ? "Welcome Back" : "Create Account"}
              </CardTitle>
              <CardDescription className="text-base">{subtitle}</CardDescription>
            </CardHeader>

            <CardContent>
              <Tabs
                value={tab}
                onValueChange={(v) => {
                  setTab(v as any);
                  setNotice(null);
                }}
              >
                <TabsList className="grid w-full grid-cols-2 rounded-xl bg-secondary">
                  <TabsTrigger value="login" className="rounded-lg">
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-lg">
                    Sign Up
                  </TabsTrigger>
                </TabsList>

                <div className="mt-6 space-y-5">
                  <TabsContent value="signup" className="m-0 space-y-5 animate-enter">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">I am a</div>
                      <div className="grid grid-cols-2 gap-4">
                        <RoleCard
                          title="Patient"
                          icon={<User className="h-5 w-5 text-primary" />}
                          active={role === "patient"}
                          onClick={() => setRole("patient")}
                        />
                        <RoleCard
                          title="Doctor"
                          icon={<Stethoscope className="h-5 w-5 text-primary" />}
                          active={role === "doctor"}
                          onClick={() => setRole("doctor")}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. John Smith" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                      <div className="text-xs text-muted-foreground">Minimum 8 characters</div>
                    </div>

                    {role === "doctor" ? (
                      <div className="space-y-2">
                        <Label htmlFor="spec">Specialization</Label>
                        <Input id="spec" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="e.g., Cardiology" />
                      </div>
                    ) : null}

                    <Button variant="hero" className="h-12 w-full rounded-xl" disabled={busy} onClick={onSignup}>
                      {busy ? "Creating…" : "Create Account"}
                    </Button>

                    <InlineNotice notice={notice} />
                  </TabsContent>

                  <TabsContent value="login" className="m-0 space-y-5 animate-enter">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">I am a</div>
                      <div className="grid grid-cols-2 gap-4">
                        <RoleCard
                          title="Patient"
                          icon={<User className="h-5 w-5 text-primary" />}
                          active={role === "patient"}
                          onClick={() => setRole("patient")}
                        />
                        <RoleCard
                          title="Doctor"
                          icon={<Stethoscope className="h-5 w-5 text-primary" />}
                          active={role === "doctor"}
                          onClick={() => setRole("doctor")}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email2">Email</Label>
                      <Input id="email2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password2">Password</Label>
                      <Input
                        id="password2"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>

                    <Button variant="hero" className="h-12 w-full rounded-xl" disabled={busy} onClick={onLogin}>
                      {busy ? "Signing in…" : "Sign In"}
                    </Button>

                    <InlineNotice notice={notice} />
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
