import React, { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { FileDown, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers/AuthProvider";
import { useVerifyRecord } from "@/pages/verify/useVerifyRecord";
import { downloadConsultationNotesPdf } from "@/lib/pdf/consultationNotesPdf";
import { downloadPredictionReportPdf } from "@/lib/pdf/predictionReportPdf";

export default function VerifyRecord() {
  const { txId = "" } = useParams();
  const { session, role, loading } = useAuth();
  const {
    tx,
    pred,
    note,
    meta,
    status,
    patientLabel,
    requestConsent,
    refresh,
  } = useVerifyRecord({
    txId,
    sessionUserId: session?.user?.id ?? null,
    role,
    authLoading: loading,
  });

  const banner = useMemo(() => {
    if (status === "auth_required")
      return { title: "Sign in required", desc: "Please sign in to view and verify this report." };
    if (status === "consent_required")
      return {
        title: "Consent required",
        desc: "This patient hasn't granted you access yet. You can request access and the patient will be notified.",
      };
    if (status === "consent_pending")
      return {
        title: "Consent pending",
        desc: "We've notified the patient. This page will unlock automatically once access is approved.",
      };
    if (status === "no_access")
      return {
        title: "No access",
        desc: "You are signed in, but you don't have permission to view this patient's report yet.",
      };
    if (status === "valid") return { title: "Verified", desc: "The record hash matches the ledger transaction." };
    if (status === "invalid") return { title: "Not verified", desc: "The record does not match the stored hash." };
    return { title: "Verifying…", desc: "Computing hash and validating." };
  }, [status]);

  const reportType = useMemo(() => {
    if (tx?.prediction_id) return "AI prediction";
    if (tx?.note_id) return "Consultation";
    if (meta?.prediction_id) return "AI prediction";
    if (meta?.note_id) return "Consultation";
    return "Report";
  }, [meta?.note_id, meta?.prediction_id, tx?.note_id, tx?.prediction_id]);

  const reportTimestamp = useMemo(() => {
    const t = tx?.created_at ?? meta?.created_at;
    return t ? new Date(t).toLocaleString() : "—";
  }, [meta?.created_at, tx?.created_at]);

  const patientDisplay = useMemo(() => {
    if (role === "patient") return session?.user?.email ?? "You";
    if (patientLabel) return patientLabel;
    const pid = tx?.patient_id ?? meta?.patient_id;
    return pid ? `${pid.slice(0, 8)}…` : "—";
  }, [meta?.patient_id, patientLabel, role, session?.user?.email, tx?.patient_id]);

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

              {(status === "consent_required" || status === "consent_pending") && role === "doctor" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {status === "consent_required" ? (
                    <Button
                      variant="hero"
                      className="rounded-xl"
                      onClick={() => requestConsent()}
                      disabled={!meta?.patient_id}
                    >
                      Request patient consent
                    </Button>
                  ) : null}

                  <Button variant="outline" className="rounded-xl" onClick={() => refresh()}>
                    Refresh
                  </Button>
                </div>
              ) : null}
            </div>

            {tx ? (
              <div className="rounded-2xl border bg-background p-6 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Patient</div>
                    <div className="mt-1 text-sm font-semibold">{patientDisplay}</div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Verification</div>
                    <div className="mt-1 inline-flex items-center gap-2 text-sm font-semibold">
                      <ShieldCheck className="h-4 w-4" /> {status === "valid" ? "Verified" : status === "invalid" ? "Not verified" : "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Report type</div>
                    <div className="mt-1 text-sm font-semibold">{reportType}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Timestamp</div>
                    <div className="mt-1 text-sm">{reportTimestamp}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Transaction ID</div>
                    <div className="mt-1 font-mono text-xs">{tx.tx_id}</div>
                  </div>
                </div>

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

                {role === "doctor" ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      variant="hero"
                      className="rounded-xl"
                      onClick={async () => {
                        if (!tx || status === "loading") return;

                        if (tx.prediction_id && pred) {
                          await downloadPredictionReportPdf({
                            patientLabel: patientDisplay,
                            prediction: pred,
                            txId: tx.tx_id,
                          });
                          return;
                        }

                        if (tx.note_id && note?.finalized_at) {
                          await downloadConsultationNotesPdf({
                            patientLabel: patientDisplay,
                            txId: tx.tx_id,
                            payload: {
                              appointment_id: note.appointment_id,
                              note_id: note.id,
                              patient_id: note.patient_id,
                              doctor_id: note.doctor_id,
                              diagnosis: note.diagnosis ?? "",
                              recommendations: note.recommendations ?? "",
                              finalized_at: note.finalized_at,
                            },
                          });
                        }
                      }}
                      disabled={status !== "valid" && status !== "invalid"}
                    >
                      <FileDown className="mr-2 h-4 w-4" /> Download PDF
                    </Button>

                    <Button asChild variant="outline" className="rounded-xl" disabled={!tx.appointment_id}>
                      <Link to={`/doctor/telemedicine?appointment=${tx.appointment_id ?? ""}`}>Open telemedicine</Link>
                    </Button>
                  </div>
                ) : null}
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
