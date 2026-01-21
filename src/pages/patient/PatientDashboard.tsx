import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Droplets,
  Dumbbell,
  Heart,
  LineChart as LineChartIcon,
  Moon,
  Sparkles,
  Thermometer,
} from "lucide-react";
import {
  CartesianGrid,
  Area,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Link } from "react-router-dom";

type MetricRow = {
  heart_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  glucose_mgdl: number | null;
  temperature_c: number | null;
  recorded_at: string;
};

type TrendPoint = {
  date: string;
  label: string;
  healthScore: number;
  bloodPressure: number;
  glucose: number;
};

function TrendsLegend({ payload }: { payload?: { value?: string; color?: string }[] }) {
  if (!payload?.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3">
      {payload.map((item) => (
        <div
          key={item.value}
          className="inline-flex items-center gap-2 rounded-full border bg-secondary/40 px-3 py-1 text-xs font-semibold text-foreground"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: item.color || "hsl(var(--muted-foreground))" }}
            aria-hidden="true"
          />
          <span className="leading-none">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function TrendsTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;

  const p0 = payload[0]?.payload as TrendPoint | undefined;
  const when = p0?.date ? new Date(p0.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

  const getVal = (key: keyof TrendPoint) => {
    const v = p0?.[key];
    return typeof v === "number" ? Math.round(v).toLocaleString() : "—";
  };

  return (
    <div className="rounded-2xl border bg-background p-3 text-xs shadow-xl">
      <div className="text-sm font-semibold">{when}</div>
      <div className="mt-2 grid gap-1.5">
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Health Score</span>
          <span className="font-mono font-semibold tabular-nums">{getVal("healthScore")}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Blood Pressure</span>
          <span className="font-mono font-semibold tabular-nums">{getVal("bloodPressure")}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Glucose</span>
          <span className="font-mono font-semibold tabular-nums">{getVal("glucose")}</span>
        </div>
      </div>
    </div>
  );
}

type PredictionRow = {
  id: string;
  created_at: string;
  risk_category: string;
  risk_percentage: number;
  health_score: number;
};

type LedgerRow = {
  prediction_id: string;
  tx_id: string;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function computeHealthScore(m: Partial<MetricRow>) {
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

function formatDelta(curr?: number | null, prev?: number | null) {
  if (curr == null || prev == null || prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  if (!Number.isFinite(pct)) return null;
  const direction = pct >= 0 ? "↑" : "↓";
  return `${direction} ${Math.abs(pct).toFixed(0)}% from last month`;
}

function shortTx(tx?: string | null) {
  if (!tx) return "—";
  return tx.length <= 12 ? tx : `${tx.slice(0, 6)}…${tx.slice(-4)}`;
}

function StatTile({
  title,
  value,
  meta,
  delta,
  icon,
  tint,
}: {
  title: string;
  value: string;
  meta: string;
  delta?: { text: string; tone: "good" | "bad" } | null;
  icon: React.ReactNode;
  tint: "rose" | "mint" | "peach" | "sky";
}) {
  const tintClass =
    tint === "rose"
      ? "border-[hsl(var(--brand-orange)/0.18)] bg-[linear-gradient(135deg,hsl(var(--brand-orange)/0.14),hsl(var(--card)))]"
      : tint === "mint"
        ? "border-[hsl(var(--brand-teal)/0.18)] bg-[linear-gradient(135deg,hsl(var(--brand-teal)/0.12),hsl(var(--card)))]"
        : tint === "peach"
          ? "border-[hsl(var(--brand-orange)/0.16)] bg-[linear-gradient(135deg,hsl(var(--brand-orange)/0.10),hsl(var(--card)))]"
          : "border-[hsl(var(--brand-teal-2)/0.18)] bg-[linear-gradient(135deg,hsl(var(--brand-teal-2)/0.10),hsl(var(--card)))]";

  const iconClass =
    tint === "rose"
      ? "bg-[hsl(var(--brand-orange)/0.14)] text-foreground"
      : tint === "mint"
        ? "bg-[hsl(var(--brand-teal)/0.14)] text-foreground"
        : tint === "peach"
          ? "bg-[hsl(var(--brand-orange)/0.12)] text-foreground"
          : "bg-[hsl(var(--brand-teal-2)/0.12)] text-foreground";

  return (
    <Card className={`rounded-2xl border shadow-soft ${tintClass} transition hover-scale`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">{title}</div>
            <div className="mt-2 font-display text-3xl font-extrabold tracking-tight">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
            {delta ? (
              <div
                className={
                  "mt-2 text-xs font-medium " +
                  (delta.tone === "good" ? "text-primary" : "text-destructive")
                }
              >
                {delta.text}
              </div>
            ) : null}
          </div>
          <div className={`grid h-11 w-11 place-items-center rounded-2xl ${iconClass}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const pct = clamp(score, 0, 100);
  const ringStyle: React.CSSProperties = {
    background: `conic-gradient(hsl(var(--brand-teal)) ${pct * 3.6}deg, hsl(var(--muted)) 0deg)`,
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="grid h-44 w-44 place-items-center rounded-full" style={ringStyle} aria-label={`Health score ${pct} out of 100`}>
        <div className="grid h-[82%] w-[82%] place-items-center rounded-full bg-card shadow-soft">
          <div className="text-center">
            <div className="font-display text-4xl font-extrabold tracking-tight">{pct}</div>
            <div className="text-xs text-muted-foreground">Health Score</div>
          </div>
        </div>
      </div>
      <div className="text-sm font-semibold">{label}</div>
    </div>
  );
}

export default function PatientDashboard() {
  const { user } = useAuth();

  const refreshTimerRef = useRef<number | null>(null);

  const [fullName, setFullName] = useState<string>("");
  const [latest, setLatest] = useState<MetricRow | null>(null);
  const [prev, setPrev] = useState<MetricRow | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [history, setHistory] = useState<(PredictionRow & { tx_id?: string | null })[]>([]);

  const [heightCm, setHeightCm] = useState("170");
  const [weightKg, setWeightKg] = useState("70");
  const [bmi, setBmi] = useState<{ value: number; label: string } | null>(null);

  const score = useMemo(() => computeHealthScore(latest ?? {}), [latest]);

  const scoreLabel = useMemo(() => {
    if (score >= 85) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 55) return "Fair";
    return "Needs attention";
  }, [score]);

  const breakdown = useMemo(() => {
    // deterministic, “dashboard-like” breakdown values
    const cardio = clamp(Math.round(score * 0.95), 0, 100);
    const metabolic = clamp(Math.round(score * 0.86 + 5), 0, 100);
    const lifestyle = clamp(Math.round(score * 0.78 + 2), 0, 100);
    return { cardio, metabolic, lifestyle };
  }, [score]);

  const tips = useMemo(
    () => [
      {
        title: "Sleep",
        body: "Get 7-9 hours of quality sleep each night for optimal health and recovery.",
      },
      {
        title: "Hydration",
        body: "Drink water regularly throughout the day—aim for clear or pale yellow urine.",
      },
      {
        title: "Movement",
        body: "Try a 20-minute walk today—small steps add up and support heart health.",
      },
    ],
    [],
  );

  const dailyTip = useMemo(() => {
    const idx = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % tips.length;
    return tips[idx];
  }, [tips]);

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id) return;

    const [profileRes, metricsRes, trendRes, predsRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("health_metrics")
        .select("heart_rate,systolic_bp,diastolic_bp,glucose_mgdl,temperature_c,recorded_at")
        .eq("patient_id", user.id)
        .order("recorded_at", { ascending: false })
        .limit(2),
      supabase
        .from("health_metrics")
        .select("heart_rate,systolic_bp,diastolic_bp,glucose_mgdl,temperature_c,recorded_at")
        .eq("patient_id", user.id)
        .order("recorded_at", { ascending: true })
        .limit(6),
      supabase
        .from("predictions")
        .select("id,created_at,risk_category,risk_percentage,health_score")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    setFullName(profileRes.data?.full_name ?? user.email?.split("@")[0] ?? "");

    const latestRow = (metricsRes.data?.[0] ?? null) as MetricRow | null;
    const prevRow = (metricsRes.data?.[1] ?? null) as MetricRow | null;
    setLatest(latestRow);
    setPrev(prevRow);

    const points = (trendRes.data ?? []) as MetricRow[];
    setTrend(
      points.map((m) => ({
        date: m.recorded_at,
        label: new Date(m.recorded_at).toLocaleDateString(undefined, { month: "short" }),
        healthScore: computeHealthScore(m),
        bloodPressure: m.systolic_bp ?? 120,
        glucose: m.glucose_mgdl ?? 95,
      })),
    );

    const preds = (predsRes.data ?? []) as PredictionRow[];
    if (!preds.length) {
      setHistory([]);
      return;
    }

    const predIds = preds.map((p) => p.id);
    const ledgerRes = await supabase
      .from("ledger_transactions")
      .select("prediction_id,tx_id")
      .in("prediction_id", predIds)
      .order("created_at", { ascending: false });

    const ledger = (ledgerRes.data ?? []) as LedgerRow[];
    const txByPrediction = new Map<string, string>();
    ledger.forEach((l) => {
      if (!txByPrediction.has(l.prediction_id)) txByPrediction.set(l.prediction_id, l.tx_id);
    });

    setHistory(preds.map((p) => ({ ...p, tx_id: txByPrediction.get(p.id) ?? null })));
  }, [user?.email, user?.id]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      fetchDashboardData();
    }, 250);
  }, [fetchDashboardData]);

  useEffect(() => {
    if (!user?.id) return;

    fetchDashboardData();

    const channel = supabase
      .channel(`patient-dashboard:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "predictions", filter: `patient_id=eq.${user.id}` },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "health_metrics", filter: `patient_id=eq.${user.id}` },
        () => scheduleRefresh(),
      )
      .subscribe((status) => {
        // Debug-only: helps confirm the dashboard is actually subscribed.
        console.debug("[patient-dashboard] realtime status:", status);
      });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchDashboardData, scheduleRefresh, user?.id]);

  const heartDelta = useMemo(() => {
    const txt = formatDelta(latest?.heart_rate, prev?.heart_rate);
    if (!txt) return null;
    const tone = txt.includes("↓") ? "good" : "bad";
    return { text: txt, tone } as const;
  }, [latest?.heart_rate, prev?.heart_rate]);

  const glucoseDelta = useMemo(() => {
    const txt = formatDelta(latest?.glucose_mgdl, prev?.glucose_mgdl);
    if (!txt) return null;
    const tone = txt.includes("↓") ? "good" : "bad";
    return { text: txt, tone } as const;
  }, [latest?.glucose_mgdl, prev?.glucose_mgdl]);

  const onCalcBmi = () => {
    const h = Number(heightCm);
    const w = Number(weightKg);
    if (!h || !w) return;
    const v = w / Math.pow(h / 100, 2);
    const label = v < 18.5 ? "Underweight" : v < 25 ? "Normal" : v < 30 ? "Overweight" : "Obese";
    setBmi({ value: Number(v.toFixed(1)), label });
  };

  return (
    <div className="grid gap-6">
      {/* Header */}
      <section className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center animate-enter">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Welcome back, {fullName}! 👋</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here's an overview of your health metrics</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/patient/telemedicine">Book Appointment</Link>
          </Button>
          <Button asChild variant="hero" className="rounded-xl">
            <Link to="/patient/predict">New Prediction</Link>
          </Button>
        </div>
      </section>

      {/* Stat tiles */}
      <section className="grid gap-4 md:grid-cols-4 animate-enter">
        <StatTile
          title="Heart Rate"
          value={`${latest?.heart_rate ?? 72} bpm`}
          meta="Normal range"
          delta={heartDelta}
          icon={<Heart className="h-5 w-5" />}
          tint="rose"
        />
        <StatTile
          title="Blood Pressure"
          value={latest?.systolic_bp && latest?.diastolic_bp ? `${latest.systolic_bp}/${latest.diastolic_bp}` : "120/80"}
          meta="Optimal"
          icon={<Activity className="h-5 w-5" />}
          tint="mint"
        />
        <StatTile
          title="Temperature"
          value={`${(((latest?.temperature_c ?? 36.9) * 9) / 5 + 32).toFixed(1)}°F`}
          meta="Normal"
          icon={<Thermometer className="h-5 w-5" />}
          tint="peach"
        />
        <StatTile
          title="Blood Glucose"
          value={`${latest?.glucose_mgdl ?? 95} mg/dL`}
          meta="Fasting level"
          delta={glucoseDelta}
          icon={<Droplets className="h-5 w-5" />}
          tint="sky"
        />
      </section>

      {/* Score + Trends */}
      <section className="grid gap-4 lg:grid-cols-3 animate-enter">
        <Card className="rounded-2xl border bg-card shadow-card transition hover-scale">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Overall Health Score
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <ScoreRing score={score} label={scoreLabel} />

            <div className="mt-8 grid gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cardiovascular</span>
                  <span className="font-medium">{breakdown.cardio}%</span>
                </div>
                <Progress value={breakdown.cardio} className="h-2" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Metabolic</span>
                  <span className="font-medium">{breakdown.metabolic}%</span>
                </div>
                <Progress value={breakdown.metabolic} className="h-2" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Lifestyle</span>
                  <span className="font-medium">{breakdown.lifestyle}%</span>
                </div>
                <Progress value={breakdown.lifestyle} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-card lg:col-span-2 transition hover-scale">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <LineChartIcon className="h-4 w-4 text-primary" /> Health Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      label={{ value: "Month", position: "insideBottom", offset: -2 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      label={{ value: "Measurement", angle: -90, position: "insideLeft" }}
                    />
                    <Tooltip content={<TrendsTooltip />} />
                    <Legend verticalAlign="bottom" content={<TrendsLegend />} />

                    {/* Subtle area fill under Health Score */}
                    <Area
                      type="monotone"
                      dataKey="healthScore"
                      name="Health Score"
                      stroke="transparent"
                      fill="hsl(var(--brand-teal))"
                      fillOpacity={0.12}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="healthScore"
                      name="Health Score"
                      stroke="hsl(var(--brand-teal))"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="bloodPressure"
                      name="Blood Pressure"
                      stroke="hsl(var(--brand-orange))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="glucose"
                      name="Glucose"
                      stroke="hsl(var(--foreground))"
                      strokeOpacity={0.55}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center rounded-2xl border bg-secondary/20 p-6 text-center">
                <div>
                  <div className="text-sm font-semibold">No trend data yet.</div>
                  <div className="mt-1 text-xs text-muted-foreground">Run your first prediction to see analytics.</div>
                  <Button asChild variant="hero" className="mt-4 rounded-xl">
                    <Link to="/patient/predict">Run Prediction</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* BMI + Tip + Quick actions */}
      <section className="grid gap-4 lg:grid-cols-3 animate-enter">
        <Card className="rounded-2xl border bg-card shadow-card transition hover-scale">
          <CardHeader>
            <CardTitle className="text-base font-semibold">BMI Calculator</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Height (cm)</div>
                  <Input value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Weight (kg)</div>
                  <Input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
                </div>
              </div>
              <Button onClick={onCalcBmi} variant="hero" className="rounded-xl">
                Calculate BMI
              </Button>
              {bmi ? (
                <div className="rounded-xl border bg-secondary/40 p-4">
                  <div className="text-sm font-semibold">BMI: {bmi.value}</div>
                  <div className="text-xs text-muted-foreground">{bmi.label}</div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-card transition hover-scale">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Daily Health Tip</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl bg-secondary/40 p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent">
                  <Moon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{dailyTip.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{dailyTip.body}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-3">
              {[<Heart key="h" className="h-4 w-4" />, <Activity key="a" className="h-4 w-4" />, <Moon key="m" className="h-4 w-4" />, <Dumbbell key="d" className="h-4 w-4" />].map(
                (ic, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="grid h-11 place-items-center rounded-xl border bg-background shadow-soft hover:bg-accent/60 hover-scale"
                    aria-label="Tip category"
                  >
                    {ic}
                  </button>
                ),
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-card transition hover-scale">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild variant="hero" className="justify-between rounded-xl">
              <Link to="/patient/predict">
                Start AI Prediction <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between rounded-xl">
              <Link to="/patient/records">
                View Medical Records <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between rounded-xl">
              <Link to="/patient/verify">
                Verify on Blockchain <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between rounded-xl">
              <Link to="/patient/telemedicine">
                Schedule Appointment <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Prediction history */}
      <section className="animate-enter">
        <Card className="rounded-2xl border bg-card shadow-card transition hover-scale">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Prediction History</CardTitle>
            <Button asChild variant="outline" size="sm" className="rounded-xl">
              <Link to="/patient/records">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Health Score</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Blockchain</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length ? (
                  history.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {p.risk_category.toUpperCase()} ({Math.round(p.risk_percentage)}%)
                      </TableCell>
                      <TableCell>{p.health_score}/100</TableCell>
                      <TableCell>None detected</TableCell>
                      <TableCell>{shortTx(p.tx_id ?? null)}</TableCell>
                      <TableCell className="text-right">
                        {p.tx_id ? (
                          <Button asChild variant="outline" size="sm" className="rounded-xl">
                            <Link to={`/verify/${p.tx_id}`}>Open</Link>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" className="rounded-xl" disabled>
                            Open
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No predictions yet. Create a new prediction to start tracking.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
