import React, { useEffect, useMemo, useState } from "react";
import { Activity, Brain, CalendarPlus, FileCheck2, ShieldCheck } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

type Metric = {
  heart_rate: number;
  systolic_bp: number;
  diastolic_bp: number;
  glucose_mgdl: number;
  temperature_c: number;
};

type PredictionPoint = { date: string; risk: number; score: number };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function computeScore(m: Partial<Metric>) {
  const hr = m.heart_rate ?? 72;
  const sys = m.systolic_bp ?? 120;
  const dia = m.diastolic_bp ?? 80;
  const glu = m.glucose_mgdl ?? 95;
  const temp = m.temperature_c ?? 36.8;

  let score = 100;
  score -= clamp(Math.abs(hr - 72) * 0.6, 0, 18);
  score -= clamp(Math.abs(sys - 120) * 0.25 + Math.abs(dia - 80) * 0.2, 0, 20);
  score -= clamp(Math.max(0, glu - 110) * 0.25, 0, 22);
  score -= clamp(Math.abs(temp - 36.8) * 10, 0, 20);

  return clamp(Math.round(score), 0, 100);
}

function scoreToRisk(score: number) {
  const risk = clamp(100 - score, 0, 100);
  const category = risk < 25 ? "Low" : risk < 60 ? "Medium" : "High";
  return { risk, category };
}

function StatCard({
  title,
  value,
  suffix,
  icon,
}: {
  title: string;
  value: string;
  suffix?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border bg-card/70 shadow-card backdrop-blur-sm transition-transform hover:-translate-y-0.5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="rounded-md bg-accent p-2 text-accent-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="font-display text-2xl font-semibold tracking-tight">
          {value}
          {suffix ? <span className="ml-1 text-sm font-medium text-muted-foreground">{suffix}</span> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Updated from your latest metrics.</p>
      </CardContent>
    </Card>
  );
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const [metric, setMetric] = useState<Metric | null>(null);
  const [trend, setTrend] = useState<PredictionPoint[]>([]);
  const [busySeed, setBusySeed] = useState(false);

  const score = useMemo(() => computeScore(metric ?? {}), [metric]);
  const riskInfo = useMemo(() => scoreToRisk(score), [score]);

  const seedIfEmpty = async () => {
    if (!user?.id) return;
    setBusySeed(true);
    try {
      const { data: rows } = await supabase.from("health_metrics").select("id").eq("patient_id", user.id).limit(1);
      if (rows?.length) return;

      const now = Date.now();
      const samples: Metric[] = [
        { heart_rate: 74, systolic_bp: 122, diastolic_bp: 80, glucose_mgdl: 98, temperature_c: 36.7 },
        { heart_rate: 78, systolic_bp: 128, diastolic_bp: 84, glucose_mgdl: 112, temperature_c: 36.9 },
        { heart_rate: 70, systolic_bp: 118, diastolic_bp: 78, glucose_mgdl: 102, temperature_c: 36.6 },
      ];

      await supabase.from("health_metrics").insert(
        samples.map((s, i) => ({
          patient_id: user.id,
          ...s,
          recorded_at: new Date(now - (samples.length - i) * 24 * 3600 * 1000).toISOString(),
        })),
      );

      toast({ title: "Demo data added", description: "We seeded a few health metrics so your dashboard looks alive." });
    } finally {
      setBusySeed(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    seedIfEmpty();

    supabase
      .from("health_metrics")
      .select("heart_rate,systolic_bp,diastolic_bp,glucose_mgdl,temperature_c")
      .eq("patient_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMetric(data as any);
      });

    supabase
      .from("predictions")
      .select("created_at,risk_percentage,health_score")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: true })
      .limit(30)
      .then(({ data }) => {
        const next =
          data?.map((p) => ({
            date: new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            risk: p.risk_percentage,
            score: p.health_score,
          })) ?? [];
        setTrend(next);
      });
  }, [user?.id]);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border bg-card/70 shadow-card backdrop-blur-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="font-display">Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard title="Overall Health Score" value={`${score}`} suffix="/100" icon={<Activity className="h-4 w-4" />} />
              <StatCard title="Risk (computed)" value={`${riskInfo.risk}%`} icon={<Brain className="h-4 w-4" />} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="hero">
                <Link to="/patient/predict">Run AI Prediction</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/patient/telemedicine">
                  <CalendarPlus className="mr-2 h-4 w-4" /> Book Appointment
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/patient/consents">
                  <ShieldCheck className="mr-2 h-4 w-4" /> Manage Consent
                </Link>
              </Button>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Risk category: <span className="font-medium text-foreground">{riskInfo.category}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-card/70 shadow-card backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-display">Latest Metrics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-background/60 p-3 shadow-soft">
                <div className="text-xs text-muted-foreground">Heart rate</div>
                <div className="mt-1 font-display text-lg font-semibold">{metric?.heart_rate ?? "—"}</div>
              </div>
              <div className="rounded-lg border bg-background/60 p-3 shadow-soft">
                <div className="text-xs text-muted-foreground">BP</div>
                <div className="mt-1 font-display text-lg font-semibold">
                  {metric ? `${metric.systolic_bp}/${metric.diastolic_bp}` : "—"}
                </div>
              </div>
              <div className="rounded-lg border bg-background/60 p-3 shadow-soft">
                <div className="text-xs text-muted-foreground">Glucose</div>
                <div className="mt-1 font-display text-lg font-semibold">{metric?.glucose_mgdl ?? "—"}</div>
              </div>
              <div className="rounded-lg border bg-background/60 p-3 shadow-soft">
                <div className="text-xs text-muted-foreground">Temp</div>
                <div className="mt-1 font-display text-lg font-semibold">{metric?.temperature_c ?? "—"}</div>
              </div>
            </div>

            <Button variant="soft" onClick={seedIfEmpty} disabled={busySeed}>
              {busySeed ? "Seeding…" : "Seed demo data"}
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border bg-card/70 shadow-card backdrop-blur-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="font-display">Prediction Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ left: 8, right: 8 }}>
                    <defs>
                      <linearGradient id="risk" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip />
                    <Area type="monotone" dataKey="risk" stroke="hsl(var(--primary))" fill="url(#risk)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rounded-lg border bg-background/60 p-6 shadow-soft">
                <div className="flex items-center gap-2 font-medium">
                  <FileCheck2 className="h-4 w-4" /> No predictions yet
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Run your first AI prediction to see trends over time.</p>
                <Button asChild className="mt-4" variant="hero">
                  <Link to="/patient/predict">Start prediction</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card/70 shadow-card backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-display">Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Each prediction can be exported as a PDF report and anchored into a ledger-style transaction for verification.
            </p>
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link to="/patient/predict">Generate new report</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
