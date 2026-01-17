import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import { QRCodeSVG } from "qrcode.react";
import { nanoid } from "nanoid";
import { z } from "zod";
import { FileDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "@/hooks/use-toast";

// NOTE: lightweight deterministic scorer (demo-friendly).
const schema = z.object({
  age_years: z.coerce.number().int().min(1).max(120),

  heart_rate: z.coerce.number().min(30).max(220),
  systolic_bp: z.coerce.number().min(70).max(220),
  diastolic_bp: z.coerce.number().min(40).max(140),

  glucose_mgdl: z.coerce.number().min(50).max(400),
  cholesterol_mgdl: z.coerce.number().min(80).max(400),
  bmi: z.coerce.number().min(10).max(60),
  temperature_c: z.coerce.number().min(34).max(42),

  physical_activity_level: z.enum(["sedentary", "light", "moderate", "high"]),
  smoking: z.coerce.boolean(),
  regular_alcohol: z.coerce.boolean(),
  family_history: z.coerce.boolean(),
});

type Inputs = z.infer<typeof schema>;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function computeScore(input: Inputs) {
  let score = 100;

  // Vital signs
  score -= clamp(Math.abs(input.heart_rate - 72) * 0.5, 0, 15);
  score -= clamp(
    Math.abs(input.systolic_bp - 120) * 0.22 +
      Math.abs(input.diastolic_bp - 80) * 0.18,
    0,
    18
  );

  // Blood tests
  score -= clamp(Math.max(0, input.glucose_mgdl - 110) * 0.2, 0, 20);
  score -= clamp(Math.max(0, input.cholesterol_mgdl - 200) * 0.05, 0, 12);

  // BMI
  if (input.bmi < 18.5) score -= clamp((18.5 - input.bmi) * 1.2, 0, 10);
  if (input.bmi > 25) score -= clamp((input.bmi - 25) * 1.2, 0, 18);

  // Temperature
  score -= clamp(Math.abs(input.temperature_c - 36.8) * 8, 0, 18);

  // Age (simple linear penalty after 40)
  score -= clamp(Math.max(0, input.age_years - 40) * 0.5, 0, 15);

  // Lifestyle factors
  if (input.smoking) score -= 10;
  if (input.regular_alcohol) score -= 6;
  if (input.family_history) score -= 8;

  // Activity (protective)
  if (input.physical_activity_level === "sedentary") score -= 8;
  if (input.physical_activity_level === "light") score -= 4;
  if (input.physical_activity_level === "high") score += 3;

  return clamp(Math.round(score), 0, 100);
}

function scoreToRisk(score: number) {
  const risk = clamp(100 - score, 0, 100);
  const category = risk < 25 ? "Low" : risk < 60 ? "Medium" : "High";
  return { risk, category };
}

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type PredictionHistoryRow = {
  id: string;
  created_at: string;
  risk_category: string;
  risk_percentage: number;
  health_score: number;
  input: any;
};

type LedgerRow = {
  prediction_id: string;
  tx_id: string;
};

function safeDateMs(d: string) {
  const ms = Date.parse(d);
  return Number.isFinite(ms) ? ms : null;
}

function downloadPredictionPdfFromRow(opts: {
  email: string;
  prediction: PredictionHistoryRow;
  txId?: string | null;
}) {
  const { email, prediction, txId } = opts;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Smart Healthcare Report", 14, 18);

  doc.setFontSize(11);
  doc.text(`Patient: ${email}`, 14, 30);
  doc.text(`Timestamp: ${new Date(prediction.created_at).toLocaleString()}`, 14, 38);
  doc.text(
    `Risk: ${Math.round(prediction.risk_percentage)}% (${prediction.risk_category})`,
    14,
    46
  );
  doc.text(`Health score: ${prediction.health_score}/100`, 14, 54);

  const input = prediction.input ?? {};
  doc.text("Inputs", 14, 68);
  const lines = [
    `Age: ${input.age_years ?? "—"} years`,
    `Blood pressure: ${input.systolic_bp ?? "—"}/${input.diastolic_bp ?? "—"}`,
    `Heart rate: ${input.heart_rate ?? "—"} bpm`,
    `Glucose: ${input.glucose_mgdl ?? "—"} mg/dL`,
    `Cholesterol: ${input.cholesterol_mgdl ?? "—"} mg/dL`,
    `BMI: ${input.bmi ?? "—"}`,
    `Temperature: ${input.temperature_c ?? "—"} °C`,
    `Physical activity: ${input.physical_activity_level ?? "—"}`,
    `Smoking: ${input.smoking ? "Yes" : "No"}`,
    `Regular alcohol: ${input.regular_alcohol ? "Yes" : "No"}`,
    `Family history: ${input.family_history ? "Yes" : "No"}`,
  ];
  lines.forEach((l, i) => doc.text(l, 14, 76 + i * 7));

  if (txId) {
    doc.text("Verification", 14, 156);
    doc.text(`Transaction ID: ${txId}`, 14, 164);
    doc.text(`Verify URL: ${window.location.origin}/verify/${txId}`, 14, 172);
  }

  doc.save(
    `smart-healthcare-report-${new Date(prediction.created_at)
      .toISOString()
      .slice(0, 10)}.pdf`
  );
}

export default function PatientPrediction() {
  const { user } = useAuth();
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<Inputs>({
    age_years: 35,

    heart_rate: 72,
    systolic_bp: 120,
    diastolic_bp: 80,

    glucose_mgdl: 95,
    cholesterol_mgdl: 180,
    bmi: 24.5,
    temperature_c: 36.8,

    physical_activity_level: "moderate",
    smoking: false,
    regular_alcohol: false,
    family_history: false,
  });

  const score = useMemo(() => computeScore(form), [form]);
  const riskInfo = useMemo(() => scoreToRisk(score), [score]);

  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  const [historyRows, setHistoryRows] = useState<(PredictionHistoryRow & { tx_id?: string | null })[]>([]);
  const [filterRisk, setFilterRisk] = useState<"all" | "Low" | "Medium" | "High">("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const loadHistory = async () => {
    if (!user?.id) return;

    const predsRes = await supabase
      .from("predictions")
      .select("id,created_at,risk_category,risk_percentage,health_score,input")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const preds = (predsRes.data ?? []) as PredictionHistoryRow[];
    if (!preds.length) {
      setHistoryRows([]);
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

    setHistoryRows(preds.map((p) => ({ ...p, tx_id: txByPrediction.get(p.id) ?? null })));
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, predictionId]);

  const filteredHistory = useMemo(() => {
    const fromMs = filterFrom ? safeDateMs(filterFrom + "T00:00:00") : null;
    const toMs = filterTo ? safeDateMs(filterTo + "T23:59:59") : null;

    return historyRows.filter((r) => {
      if (filterRisk !== "all" && r.risk_category !== filterRisk) return false;

      const createdMs = safeDateMs(r.created_at);
      if (createdMs == null) return true;
      if (fromMs != null && createdMs < fromMs) return false;
      if (toMs != null && createdMs > toMs) return false;
      return true;
    });
  }, [historyRows, filterFrom, filterTo, filterRisk]);

  const savePrediction = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const input = schema.parse(form);

      const { data: created, error } = await supabase
        .from("predictions")
        .insert({
          patient_id: user.id,
          created_by: user.id,
          input,
          risk_percentage: riskInfo.risk,
          risk_category: riskInfo.category,
          health_score: score,
          doctor_remarks: remarks || null,
        })
        .select("id")
        .single();

      if (error) throw error;
      setPredictionId(created.id);

      // Ledger-style anchoring
      const payload = JSON.stringify({ input, risk: riskInfo, score, at: new Date().toISOString(), patient_id: user.id });
      const payloadHash = await sha256(payload);

      const { data: lastTx } = await supabase
        .from("ledger_transactions")
        .select("payload_hash")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextTxId = `tx_${nanoid(10)}`;
      const { error: txErr } = await supabase.from("ledger_transactions").insert({
        prediction_id: created.id,
        patient_id: user.id,
        created_by: user.id,
        tx_id: nextTxId,
        prev_hash: lastTx?.payload_hash ?? null,
        payload_hash: payloadHash,
      });
      if (txErr) throw txErr;
      setTxId(nextTxId);

      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "prediction",
        title: "Prediction completed",
        body: `Risk: ${riskInfo.risk}% (${riskInfo.category}) — Score: ${score}/100`,
        href: "/patient/predict",
      });

      toast({ title: "Saved", description: "Prediction stored and anchored into the verification ledger." });
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (!user?.email) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Smart Healthcare Report", 14, 18);

    doc.setFontSize(11);
    doc.text(`Patient: ${user.email}`, 14, 30);
    doc.text(`Timestamp: ${new Date().toLocaleString()}`, 14, 38);
    doc.text(`Risk: ${riskInfo.risk}% (${riskInfo.category})`, 14, 46);
    doc.text(`Health score: ${score}/100`, 14, 54);

    doc.text("Inputs", 14, 68);
    const lines = [
      `Age: ${form.age_years} years`,
      `Blood pressure: ${form.systolic_bp}/${form.diastolic_bp}`,
      `Heart rate: ${form.heart_rate} bpm`,
      `Glucose: ${form.glucose_mgdl} mg/dL`,
      `Cholesterol: ${form.cholesterol_mgdl} mg/dL`,
      `BMI: ${form.bmi}`,
      `Temperature: ${form.temperature_c} °C`,
      `Physical activity: ${form.physical_activity_level}`,
      `Smoking: ${form.smoking ? "Yes" : "No"}`,
      `Regular alcohol: ${form.regular_alcohol ? "Yes" : "No"}`,
      `Family history: ${form.family_history ? "Yes" : "No"}`,
    ];
    lines.forEach((l, i) => doc.text(l, 14, 76 + i * 7));

    if (remarks.trim()) {
      doc.text("Remarks", 14, 112);
      doc.text(doc.splitTextToSize(remarks.trim(), 180), 14, 120);
    }

    if (txId) {
      doc.text("Verification", 14, 150);
      doc.text(`Transaction ID: ${txId}`, 14, 158);
      doc.text(`Verify URL: ${window.location.origin}/verify/${txId}`, 14, 166);
    }

    doc.save(`smart-healthcare-report-${Date.now()}.pdf`);

    if (user?.id) {
      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "report",
        title: "Report generated",
        body: "Your PDF report is ready.",
        href: "/patient/predict",
      });
    }
  };

  return (
    <div className="grid gap-6">
      <Card className="border bg-card/70 shadow-card backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-display">AI Disease Risk Prediction</CardTitle>
        </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="grid gap-5">
              <div className="grid gap-3">
                <div className="text-sm font-medium">Vital Signs</div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Age (years)</Label>
                    <Input
                      value={form.age_years}
                      onChange={(e) => setForm((p) => ({ ...p, age_years: e.target.value as any }))}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Blood Pressure (Systolic)</Label>
                    <Input
                      value={form.systolic_bp}
                      onChange={(e) => setForm((p) => ({ ...p, systolic_bp: e.target.value as any }))}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Blood Pressure (Diastolic)</Label>
                    <Input
                      value={form.diastolic_bp}
                      onChange={(e) => setForm((p) => ({ ...p, diastolic_bp: e.target.value as any }))}
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Heart Rate (bpm)</Label>
                  <Input
                    value={form.heart_rate}
                    onChange={(e) => setForm((p) => ({ ...p, heart_rate: e.target.value as any }))}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="text-sm font-medium">Blood Tests</div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Glucose (mg/dL)</Label>
                    <Input
                      value={form.glucose_mgdl}
                      onChange={(e) => setForm((p) => ({ ...p, glucose_mgdl: e.target.value as any }))}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cholesterol (mg/dL)</Label>
                    <Input
                      value={form.cholesterol_mgdl}
                      onChange={(e) => setForm((p) => ({ ...p, cholesterol_mgdl: e.target.value as any }))}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>BMI</Label>
                    <Input
                      value={form.bmi}
                      onChange={(e) => setForm((p) => ({ ...p, bmi: e.target.value as any }))}
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Temperature (°C)</Label>
                  <Input
                    value={form.temperature_c}
                    onChange={(e) => setForm((p) => ({ ...p, temperature_c: e.target.value as any }))}
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="text-sm font-medium">Lifestyle Factors</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Physical Activity Level</Label>
                    <Select
                      value={form.physical_activity_level}
                      onValueChange={(v) => setForm((p) => ({ ...p, physical_activity_level: v as Inputs["physical_activity_level"] }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sedentary">Sedentary</SelectItem>
                        <SelectItem value="light">Light (1–2 days/week)</SelectItem>
                        <SelectItem value="moderate">Moderate (3–4 days/week)</SelectItem>
                        <SelectItem value="high">High (5+ days/week)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-3 pt-1">
                    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card/70 px-4 py-3 shadow-soft">
                      <div className="text-sm font-medium">Smoking</div>
                      <Switch checked={form.smoking} onCheckedChange={(v) => setForm((p) => ({ ...p, smoking: v }))} />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card/70 px-4 py-3 shadow-soft">
                      <div className="text-sm font-medium">Regular Alcohol</div>
                      <Switch
                        checked={form.regular_alcohol}
                        onCheckedChange={(v) => setForm((p) => ({ ...p, regular_alcohol: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card/70 px-4 py-3 shadow-soft">
                      <div className="text-sm font-medium">Family History</div>
                      <Switch
                        checked={form.family_history}
                        onCheckedChange={(v) => setForm((p) => ({ ...p, family_history: v }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Doctor remarks (optional)</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Observations, advice, next steps…"
                />
              </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="hero" onClick={savePrediction} disabled={busy}>
                {busy ? "Saving…" : "Run & Save"}
              </Button>
              <Button variant="outline" onClick={downloadPdf} disabled={!predictionId}>
                Download PDF
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              This is a lightweight, deterministic scorer for MVP demo. Swap with a real ML model later via backend function.
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-xl border bg-background/60 p-5 shadow-soft">
              <div className="text-sm text-muted-foreground">Risk</div>
              <div className="mt-1 font-display text-4xl font-semibold">{riskInfo.risk}%</div>
              <div className="mt-1 text-sm">
                Category: <span className="font-medium">{riskInfo.category}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-card/70 p-3 shadow-soft">
                  <div className="text-xs text-muted-foreground">Health score</div>
                  <div className="mt-1 font-display text-2xl font-semibold">{score}/100</div>
                </div>
                <div className="rounded-lg border bg-card/70 p-3 shadow-soft">
                  <div className="text-xs text-muted-foreground">Saved?</div>
                  <div className="mt-1 font-display text-2xl font-semibold">{predictionId ? "Yes" : "No"}</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-background/60 p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Blockchain-style verification</div>
                  <div className="text-sm text-muted-foreground">We anchor the report hash into a simulated ledger.</div>
                </div>
                {txId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/verify/${txId}`}>Verify</Link>
                  </Button>
                ) : null}
              </div>

              {txId ? (
                <div className="mt-4 grid gap-3 md:grid-cols-[140px_1fr]">
                  <div className="rounded-lg border bg-card/70 p-3 shadow-soft">
                    <QRCodeSVG
                      value={`${window.location.origin}/verify/${txId}`}
                      width={110}
                      height={110}
                      bgColor="transparent"
                      fgColor="hsl(var(--foreground))"
                    />
                    <div className="mt-2 text-[11px] text-muted-foreground">Scan to verify</div>
                  </div>
                  <div className="rounded-lg border bg-card/70 p-3 shadow-soft">
                    <div className="text-xs text-muted-foreground">Transaction ID</div>
                    <div className="mt-1 font-mono text-sm">{txId}</div>
                    <div className="mt-3 text-xs text-muted-foreground">Open verification page to validate the stored hash.</div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border bg-card/70 p-4 shadow-soft">
                  <div className="text-sm text-muted-foreground">Save a prediction to generate a transaction + QR code.</div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border bg-card shadow-card">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base font-semibold">Prediction History</CardTitle>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                aria-label="From date"
              />
              <Input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                aria-label="To date"
              />
            </div>

            <Select value={filterRisk} onValueChange={(v) => setFilterRisk(v as any)}>
              <SelectTrigger className="md:w-[170px]">
                <SelectValue placeholder="Risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risks</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Health Score</TableHead>
                <TableHead className="text-right">View PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHistory.length ? (
                filteredHistory.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {r.risk_category.toUpperCase()} ({Math.round(r.risk_percentage)}%)
                    </TableCell>
                    <TableCell>{r.health_score}/100</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          if (!user?.email) return;
                          downloadPredictionPdfFromRow({
                            email: user.email,
                            prediction: r,
                            txId: r.tx_id ?? null,
                          });
                        }}
                      >
                        <FileDown className="mr-2 h-4 w-4" /> View PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No records match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
