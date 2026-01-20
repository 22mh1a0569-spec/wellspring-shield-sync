import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { FileDown, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadConsultationNotesPdf } from "@/lib/pdf/consultationNotesPdf";

type PredictionRow = {
  id: string;
  created_at: string;
  risk_category: string;
  risk_percentage: number;
  health_score: number;
  input: any;
};

type NoteRow = {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  diagnosis: string | null;
  recommendations: string | null;
  is_final: boolean;
  finalized_at: string | null;
};

function downloadPredictionPdf(opts: {
  email: string;
  prediction: PredictionRow;
}) {
  const { email, prediction } = opts;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Smart Healthcare Report", 14, 18);

  doc.setFontSize(11);
  doc.text(`Patient: ${email}`, 14, 30);
  doc.text(`Timestamp: ${new Date(prediction.created_at).toLocaleString()}`, 14, 38);
  doc.text(`Risk: ${Math.round(prediction.risk_percentage)}% (${prediction.risk_category})`, 14, 46);
  doc.text(`Health score: ${prediction.health_score}/100`, 14, 54);

  const input = prediction.input ?? {};
  doc.text("Inputs", 14, 68);
  const lines = [
    `Heart rate: ${input.heart_rate ?? "—"}`,
    `Blood pressure: ${input.systolic_bp ?? "—"}/${input.diastolic_bp ?? "—"}`,
    `Glucose: ${input.glucose_mgdl ?? "—"} mg/dL`,
    `Temperature: ${input.temperature_c ?? "—"} °C`,
  ];
  lines.forEach((l, i) => doc.text(l, 14, 76 + i * 8));

  doc.save(`smart-healthcare-report-${new Date(prediction.created_at).toISOString().slice(0, 10)}.pdf`);
}

export default function PatientRecords() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PredictionRow[]>([]);
  const [notes, setNotes] = useState<(NoteRow & { tx_id?: string | null })[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user?.id) return;

    supabase
      .from("predictions")
      .select("id,created_at,risk_category,risk_percentage,health_score,input")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setRows((data ?? []) as any));

    supabase
      .from("appointment_notes")
      .select("id,appointment_id,doctor_id,patient_id,diagnosis,recommendations,is_final,finalized_at")
      .eq("patient_id", user.id)
      .eq("is_final", true)
      .order("finalized_at", { ascending: false })
      .limit(50)
      .then(async ({ data }) => {
        const n = ((data ?? []) as any[]) as NoteRow[];
        if (!n.length) {
          setNotes([]);
          return;
        }

        const noteIds = n.map((x) => x.id);
        const { data: txRows } = await supabase
          .from("ledger_transactions")
          .select("note_id,tx_id")
          .in("note_id", noteIds)
          .order("created_at", { ascending: false });

        const txByNote = new Map<string, string>();
        (txRows ?? []).forEach((t: any) => {
          if (t?.note_id && !txByNote.has(t.note_id)) txByNote.set(t.note_id, t.tx_id);
        });

        setNotes(n.map((x) => ({ ...x, tx_id: txByNote.get(x.id) ?? null })));
      });
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const d = new Date(r.created_at).toLocaleDateString().toLowerCase();
      return d.includes(q) || r.risk_category.toLowerCase().includes(q);
    });
  }, [rows, query]);

  return (
    <div className="grid gap-6">
      <section className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Medical Records</h1>
          <p className="mt-1 text-sm text-muted-foreground">Download your past AI prediction reports.</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            placeholder="Search by date or risk..."
          />
        </div>
      </section>

      <Card className="rounded-2xl border bg-card shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Prediction Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Health Score</TableHead>
                <TableHead className="text-right">Download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length ? (
                filtered.map((r) => (
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
                          downloadPredictionPdf({ email: user.email, prediction: r });
                        }}
                      >
                        <FileDown className="mr-2 h-4 w-4" /> PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No records yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border bg-card shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Consultation Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead className="text-right">Download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.length ? (
                notes.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>{new Date(n.finalized_at ?? n.created_at ?? Date.now()).toLocaleDateString()}</TableCell>
                    <TableCell className="font-mono text-xs">{n.doctor_id.slice(0, 8)}…</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          if (!user?.email || !n.finalized_at) return;
                          downloadConsultationNotesPdf({
                            patientLabel: user.email,
                            txId: (n as any).tx_id ?? null,
                            payload: {
                              appointment_id: n.appointment_id,
                              note_id: n.id,
                              patient_id: n.patient_id,
                              doctor_id: n.doctor_id,
                              diagnosis: n.diagnosis ?? "",
                              recommendations: n.recommendations ?? "",
                              finalized_at: n.finalized_at,
                            },
                          });
                        }}
                      >
                        <FileDown className="mr-2 h-4 w-4" /> PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    No consultation notes yet.
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
