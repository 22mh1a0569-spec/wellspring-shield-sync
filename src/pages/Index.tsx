import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { HealthChainBrand } from "@/components/HealthChainBrand";

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
      <main className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 items-center gap-10 px-6 py-10 md:grid-cols-2">
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

        <section className="animate-fade-in">
          <div className="mx-auto w-full max-w-lg rounded-2xl border bg-card p-8 shadow-card">
            <div className="text-center">
              <div className="font-display text-3xl font-extrabold tracking-tight">Welcome Back</div>
              <div className="mt-2 text-base text-muted-foreground">Sign in to access your health dashboard</div>
            </div>

            <div className="mt-8 grid gap-3">
              <Button asChild variant="hero" className="h-12 w-full rounded-xl">
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 w-full rounded-xl">
                <Link to="/auth">Sign Up</Link>
              </Button>
            </div>

            <div className="mt-8 rounded-2xl border bg-secondary p-5">
              <div className="text-sm font-semibold">Getting Started</div>
              <div className="mt-2 text-sm text-muted-foreground">Create an account to start tracking your health</div>
              <div className="mt-2 text-sm font-semibold text-primary">Your data is secured with blockchain technology</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
