import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";

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
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <HealthChainBrand />
        </div>

        <nav className="flex items-center gap-3">
          <Button asChild variant="ghost" className="rounded-xl">
            <Link to="/auth">Sign In</Link>
          </Button>
          <Button asChild variant="hero" className="rounded-xl">
            <Link to="/auth">Get Started</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-88px)] max-w-7xl flex-col items-center justify-center px-6 pb-16">
        <section className="animate-fade-in text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-soft">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            AI-Powered Healthcare Platform
          </div>

          <h1 className="mx-auto mt-8 max-w-4xl font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-foreground md:text-6xl">
            Secure Health Records with
            <br />
            <span className="text-primary">Blockchain</span> &amp; AI
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Experience the future of healthcare with AI-powered disease prediction, blockchain-secured medical records, and seamless telemedicine integration.
          </p>

          <div className="mx-auto mt-10 flex w-full max-w-xl flex-col items-stretch justify-center gap-3 sm:flex-row">
            <Button asChild variant="hero" className="h-12 rounded-xl px-8">
              <Link to="/auth">Get Started Free</Link>
            </Button>
            <Button variant="outline" className="h-12 rounded-xl px-8">
              Watch Demo
            </Button>
          </div>

          <div className="mx-auto mt-10 flex flex-col items-center justify-center gap-6 text-sm text-muted-foreground sm:flex-row">
            <div className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
              HIPAA Compliant
            </div>
            <div className="inline-flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-primary" aria-hidden="true" />
              End-to-End Encrypted
            </div>
            <div className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              Blockchain Secured
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
