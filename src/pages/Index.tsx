import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Brain, ShieldCheck, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers/AuthProvider";

const Index = () => {
  const { session, role, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (role === "doctor") nav("/doctor", { replace: true });
    if (role === "patient") nav("/patient", { replace: true });
  }, [loading, session, role, nav]);

  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b bg-background/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="font-display text-lg font-semibold">Smart Healthcare</div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link to="/auth">Login / Signup</Link>
            </Button>
            <Button asChild variant="hero">
              <Link to="/auth">
                Enter demo <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border bg-card/70 p-8 shadow-card backdrop-blur-sm animate-fade-in">
            <h1 className="font-display text-4xl font-semibold tracking-tight">Smart Healthcare using AI & Blockchain</h1>
            <p className="mt-3 text-muted-foreground">
              A production-quality MVP for academic demo: AI risk prediction, consent-based access control, telemedicine workflows,
              and ledger-style verification.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild variant="hero">
                <Link to="/auth">Start (Patient/Doctor)</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/verify/tx_demo">Try verification page</Link>
              </Button>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Security note: roles are stored server-side in a dedicated table (not in local storage).
            </p>
          </div>

          <div className="grid gap-4">
            <Card className="border bg-card/70 shadow-card backdrop-blur-sm animate-fade-in">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display text-base">AI Prediction</CardTitle>
                <div className="rounded-md bg-accent p-2 text-accent-foreground">
                  <Brain className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Deterministic MVP scorer with saved history and trend charts.
              </CardContent>
            </Card>

            <Card className="border bg-card/70 shadow-card backdrop-blur-sm animate-fade-in">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display text-base">Consent-first</CardTitle>
                <div className="rounded-md bg-accent p-2 text-accent-foreground">
                  <ShieldCheck className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Patients grant/revoke access; doctors see only what they’re authorized to view.
              </CardContent>
            </Card>

            <Card className="border bg-card/70 shadow-card backdrop-blur-sm animate-fade-in">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display text-base">Telemedicine</CardTitle>
                <div className="rounded-md bg-accent p-2 text-accent-foreground">
                  <Video className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Appointment booking + a realtime chat channel per consultation.
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
