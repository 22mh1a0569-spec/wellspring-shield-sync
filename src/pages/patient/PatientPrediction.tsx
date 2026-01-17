import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import { QRCodeSVG } from "qrcode.react";
import { nanoid } from "nanoid";
import { z } from "zod";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "@/hooks/use-toast";

// NOTE: lightweight deterministic scorer (demo-friendly).
const schema = z.object({
  heart_rate: z.coerce.number().min(30).max(220),
  systolic_bp: z.coerce.number().min(70).max(220),
  diastolic_bp: z.coerce.number().min(40).max(140),
  glucose_mgdl: z.coerce.number().min(50).max(400),
  temperature_c: z.coerce.number().min(34).max(42),
});

type Inputs = z.infer<typeof schema>;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function computeScore(input: Inputs) {
  let score = 100;
  score -= clamp(Math.abs(input.heart_rate - 72) * 0.6, 0, 18);
  score -= clamp(Math.abs(input.systolic_bp - 120) * 0.25 + Math.abs(input.diastolic_bp - 80) * 0.2, 0, 20);
  score -= clamp(Math.max(0, input.glucose_mgdl - 110) * 0.25, 0, 22);
  score -= clamp(Math.abs(input.temperature_c - 36.8) * 10, 0, 20);
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

export default function PatientPrediction() {
  const { user } = useAuth();
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<Inputs>({
    heart_rate: 76,
    systolic_bp: 126,
    diastolic_bp: 82,
    glucose_mgdl: 108,
    temperature_c: 36.9,
  });

  const score = useMemo(() => computeScore(form), [form]);
  const riskInfo = useMemo(() => scoreToRisk(score), [score]);

  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

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
      `Heart rate: ${form.heart_rate}`,
      `Blood pressure: ${form.systolic_bp}/${form.diastolic_bp}`,
      `Glucose: ${form.glucose_mgdl} mg/dL`,
      `Temperature: ${form.temperature_c} °C`,
    ];
    lines.forEach((l, i) => doc.text(l, 14, 76 + i * 8));

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
          <div className="grid gap-4">
            {(
              [
                ["Heart rate", "heart_rate"],
                ["Systolic BP", "systolic_bp"],
                ["Diastolic BP", "diastolic_bp"],
                ["Glucose (mg/dL)", "glucose_mgdl"],
                ["Temperature (°C)", "temperature_c"],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input
                  value={(form as any)[key]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  inputMode="decimal"
                />
              </div>
            ))}

            <div className="space-y-2">
              <Label>Doctor remarks (optional)</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Observations, advice, next steps…" />
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
                    <QRCode
                      value={`${window.location.origin}/verify/${txId}`}
                      size={110}
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
    </div>
  );
}
