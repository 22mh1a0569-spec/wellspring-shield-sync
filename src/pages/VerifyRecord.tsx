import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

type Tx = {
  tx_id: string;
  payload_hash: string;
  prev_hash: string | null;
  created_at: string;
  prediction_id: string | null;
  note_id: string | null;
  appointment_id: string | null;
  patient_id: string;
};

type Pred = {
  created_at: string;
  risk_percentage: number;
  risk_category: string;
  health_score: number;
  input: any;
};

type Note = {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  diagnosis: string | null;
  recommendations: string | null;
  finalized_at: string | null;
};

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function VerifyRecord() {
  const { txId = "" } = useParams();
  const { session, role, loading } = useAuth();
  const [tx, setTx] = useState<Tx | null>(null);
  const [pred, setPred] = useState<Pred | null>(null);
  const [status, setStatus] = useState<
    "loading" | "valid" | "invalid" | "notfound" | "auth_required" | "no_access"
  >("loading");

  useEffect(() => {
    const run = async () => {
      setTx(null);
      setPred(null);

      if (loading) return;

      // Integrity links (QR / hash) are shareable, but report content requires authentication.
      if (!session) {
        setStatus("auth_required");
        return;
      }

      const { data: txRow } = await supabase
        .from("ledger_transactions")
        .select("tx_id,payload_hash,prev_hash,created_at,prediction_id,note_id,appointment_id,patient_id")
        .eq("tx_id", txId)
        .maybeSingle();

      // With RLS, lack of permission may look like "not found". Treat as "no_access" for signed-in users.
      if (!txRow) {
        setStatus("no_access");
        return;
      }

      setTx(txRow as any);

      // Support verifying either a prediction report OR finalized consultation notes.
      if ((txRow as any).prediction_id) {
        const { data: predRow } = await supabase
          .from("predictions")
          .select("created_at,risk_percentage,risk_category,health_score,input")
          .eq("id", (txRow as any).prediction_id)
          .maybeSingle();

        if (!predRow) {
          setStatus("no_access");
          return;
        }
        setPred(predRow as any);

        const payload = JSON.stringify({
          input: (predRow as any).input,
          risk: { risk: (predRow as any).risk_percentage, category: (predRow as any).risk_category },
          score: (predRow as any).health_score,
          at: (predRow as any).created_at,
          patient_id: (txRow as any).patient_id,
        });
        const computed = await sha256(payload);
        setStatus(computed === (txRow as any).payload_hash ? "valid" : "invalid");
        return;
      }

      if ((txRow as any).note_id) {
        const { data: noteRow } = await supabase
          .from("appointment_notes")
          .select("id,appointment_id,doctor_id,patient_id,diagnosis,recommendations,finalized_at")
          .eq("id", (txRow as any).note_id)
          .maybeSingle();

        if (!noteRow) {
          setStatus("no_access");
          return;
        }

        const note = noteRow as any;
        const finalizedAt = note.finalized_at ?? (txRow as any).created_at;

        const payload = JSON.stringify({
          appointment_id: note.appointment_id,
          note_id: note.id,
          patient_id: note.patient_id,
          doctor_id: note.doctor_id,
          diagnosis: note.diagnosis ?? "",
          recommendations: note.recommendations ?? "",
          finalized_at: finalizedAt,
        });
        const computed = await sha256(payload);
        setStatus(computed === (txRow as any).payload_hash ? "valid" : "invalid");
        return;
      }

      setStatus("invalid");
    };

    run();
  }, [txId, session, loading]);

  const banner = useMemo(() => {
    if (status === "auth_required")
      return { title: "Sign in required", desc: "Please sign in to view and verify this report." };
    if (status === "no_access")
      return {
        title: "No access",
        desc: "You are signed in, but you don't have permission to view this patient's report yet.",
      };
    if (status === "valid") return { title: "Verified", desc: "The record hash matches the ledger transaction." };
    if (status === "invalid") return { title: "Not verified", desc: "The record does not match the stored hash." };
    if (status === "notfound") return { title: "Transaction not found", desc: "No ledger transaction matches this ID." };
    return { title: "Verifying…", desc: "Computing hash and validating." };
  }, [status]);

  return (
    <div className="min-h-screen bg-hero">
      <div className="mx-auto max-w-4xl px-6 py-10 animate-fade-in">
        <Card className="border bg-card shadow-card">
          <CardHeader>
            <CardTitle className="font-display">Blockchain Record Verification</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-2xl border bg-background p-6 shadow-soft">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4" /> {banner.title}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{banner.desc}</div>

              {status === "auth_required" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="hero" className="rounded-xl">
                    <Link to="/auth" state={{ from: `/verify/${txId}` }}>
                      Sign in
                    </Link>
                  </Button>
                </div>
              ) : null}

              {status === "no_access" && role === "doctor" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link to="/doctor/telemedicine">Open Telemedicine</Link>
                  </Button>
                </div>
              ) : null}
            </div>

            {tx ? (
              <div className="rounded-2xl border bg-background p-6 shadow-soft">
                <div className="text-xs text-muted-foreground">Transaction ID</div>
                <div className="mt-1 font-mono text-sm">{tx.tx_id}</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Payload hash</div>
                    <div className="mt-1 break-all font-mono text-xs">{tx.payload_hash}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Previous hash</div>
                    <div className="mt-1 break-all font-mono text-xs">{tx.prev_hash ?? "(genesis)"}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {pred ? (
              <div className="rounded-2xl border bg-background p-6 shadow-soft">
                <div className="text-sm font-semibold">Report snapshot</div>
                <div className="mt-2 grid gap-2 text-sm">
                  <div>
                    Risk: <span className="font-semibold">{pred.risk_percentage}% ({pred.risk_category})</span>
                  </div>
                  <div>
                    Score: <span className="font-semibold">{pred.health_score}/100</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Created: {new Date(pred.created_at).toLocaleString()}</div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
