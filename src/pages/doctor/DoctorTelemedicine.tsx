import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { FileDown } from "lucide-react";
import { nanoid } from "nanoid";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { downloadConsultationNotesPdf, sha256 as sha256Hex } from "@/lib/pdf/consultationNotesPdf";

type Appointment = {
  id: string;
  doctor_id: string;
  patient_id: string;
  scheduled_for: string;
  status: string;
  reason: string | null;
};

type Msg = { id: string; sender_id: string; body: string; created_at: string };

type Availability = { doctor_id: string; is_available: boolean; note: string | null };

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

const noteSchema = z.object({
  diagnosis: z.string().trim().max(2000).optional(),
  recommendations: z.string().trim().max(4000).optional(),
});

export default function DoctorTelemedicine() {
  const { user } = useAuth();
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [active, setActive] = useState<Appointment | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [message, setMessage] = useState("");

  const [note, setNote] = useState<NoteRow | null>(null);
  const [noteTxId, setNoteTxId] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const canEditNote = useMemo(() => !note?.is_final, [note?.is_final]);

  const refresh = async () => {
    if (!user?.id) return;
    const { data: avail } = await supabase
      .from("doctor_availability")
      .select("doctor_id,is_available,note")
      .eq("doctor_id", user.id)
      .maybeSingle();
    setAvailability((avail as any) ?? { doctor_id: user.id, is_available: true, note: null });

    const { data: appts } = await supabase
      .from("appointments")
      .select("id,doctor_id,patient_id,scheduled_for,status,reason")
      .eq("doctor_id", user.id)
      .order("scheduled_for", { ascending: true });
    setAppointments((appts as any) ?? []);
  };

  useEffect(() => {
    refresh();
  }, [user?.id]);

  useEffect(() => {
    if (!active?.id || !user?.id) {
      setMessages([]);
      setNote(null);
      setNoteTxId(null);
      setDiagnosis("");
      setRecommendations("");
      return;
    }

    supabase
      .from("chat_messages")
      .select("id,sender_id,body,created_at")
      .eq("appointment_id", active.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data as any) ?? []));

    // Load existing note (draft or finalized)
    supabase
      .from("appointment_notes")
      .select("id,appointment_id,doctor_id,patient_id,diagnosis,recommendations,is_final,finalized_at")
      .eq("appointment_id", active.id)
      .maybeSingle()
      .then(async ({ data }) => {
        const n = (data as any) as NoteRow | null;
        setNote(n);
        setDiagnosis(n?.diagnosis ?? "");
        setRecommendations(n?.recommendations ?? "");

        if (!n?.id) {
          setNoteTxId(null);
          return;
        }

        const { data: tx } = await supabase
          .from("ledger_transactions")
          .select("tx_id")
          .eq("note_id", n.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setNoteTxId((tx as any)?.tx_id ?? null);
      });

    const channel = supabase
      .channel(`chat:${active.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `appointment_id=eq.${active.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new as any]),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active?.id, user?.id]);

  const toggle = async (next: boolean) => {
    if (!user?.id) return;
    const { error } = await supabase.from("doctor_availability").upsert({ doctor_id: user.id, is_available: next });
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    setAvailability((p) => (p ? { ...p, is_available: next } : { doctor_id: user.id, is_available: next, note: null }));
    toast({ title: "Availability updated", description: next ? "You are available for bookings." : "Bookings paused." });
  };

  const send = async () => {
    if (!user?.id || !active?.id) return;
    const text = message.trim();
    if (!text) return;
    setMessage("");

    const { error } = await supabase.from("chat_messages").insert({
      appointment_id: active.id,
      sender_id: user.id,
      body: text,
    });
    if (error) toast({ title: "Message failed", description: error.message, variant: "destructive" });
  };

  const saveDraft = async (finalize: boolean) => {
    if (!user?.id || !active?.id) return;

    try {
      const parsed = noteSchema.parse({ diagnosis, recommendations });
      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from("appointment_notes")
        .upsert(
          {
            appointment_id: active.id,
            doctor_id: user.id,
            patient_id: active.patient_id,
            diagnosis: parsed.diagnosis?.trim() || null,
            recommendations: parsed.recommendations?.trim() || null,
            is_final: finalize ? true : false,
            finalized_at: finalize ? nowIso : null,
          },
          { onConflict: "appointment_id" },
        )
        .select("id,appointment_id,doctor_id,patient_id,diagnosis,recommendations,is_final,finalized_at")
        .single();

      if (error) throw error;
      setNote(data as any);

      if (!finalize) {
        toast({ title: "Draft saved", description: "Consultation notes draft saved." });
        return;
      }

      // Anchor finalized notes into the ledger
      const payload = JSON.stringify({
        appointment_id: (data as any).appointment_id,
        note_id: (data as any).id,
        patient_id: (data as any).patient_id,
        doctor_id: (data as any).doctor_id,
        diagnosis: (data as any).diagnosis ?? "",
        recommendations: (data as any).recommendations ?? "",
        finalized_at: (data as any).finalized_at ?? nowIso,
      });
      const payloadHash = await sha256Hex(payload);

      const { data: lastTx } = await supabase
        .from("ledger_transactions")
        .select("payload_hash")
        .eq("patient_id", active.patient_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextTxId = `tx_${nanoid(10)}`;
      const { error: txErr } = await supabase.from("ledger_transactions").insert({
        prediction_id: null,
        note_id: (data as any).id,
        appointment_id: active.id,
        patient_id: active.patient_id,
        created_by: user.id,
        tx_id: nextTxId,
        prev_hash: (lastTx as any)?.payload_hash ?? null,
        payload_hash: payloadHash,
      });
      if (txErr) throw txErr;

      setNoteTxId(nextTxId);

      // Mark appointment complete (notes finalized)
      await supabase
        .from("appointments")
        .update({ status: "completed", ended_at: nowIso })
        .eq("id", active.id);

      toast({ title: "Finalized", description: "Notes finalized and anchored into the verification ledger." });
    } catch (e: any) {
      toast({ title: "Could not save notes", description: e?.message ?? "Try again", variant: "destructive" });
    }
  };

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border bg-card shadow-card">
          <CardHeader>
            <CardTitle className="font-display">Availability</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Accept bookings</div>
              <div className="text-xs text-muted-foreground">Patients can book only when enabled.</div>
            </div>
            <Switch checked={availability?.is_available ?? true} onCheckedChange={toggle} />
          </CardContent>
          <CardContent className="pt-0">
            <div className="rounded-2xl border bg-background p-4 text-xs shadow-soft">
              Your doctor ID (share with patients):
              <div className="mt-1 font-mono text-sm">{user?.id}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-card md:col-span-2">
          <CardHeader>
            <CardTitle className="font-display">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {appointments.length ? (
              appointments.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setActive(a)}
                  className={`w-full rounded-2xl border bg-background p-5 text-left shadow-soft transition hover:-translate-y-0.5 ${
                    active?.id === a.id ? "ring-2 ring-ring" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{format(new Date(a.scheduled_for), "PPp")}</div>
                    <div className="text-xs text-muted-foreground">{a.status}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Patient: {a.patient_id.slice(0, 8)}…</div>
                  {a.reason ? <div className="mt-2 text-sm">{a.reason}</div> : null}
                </button>
              ))
            ) : (
              <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground shadow-soft">No appointments yet.</div>
            )}

            {active ? (
              <div className="mt-4 grid gap-3 rounded-2xl border bg-background p-5 shadow-soft">
                <div className="font-semibold">Consultation</div>

                <div className="rounded-2xl border bg-card p-4 shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Doctor notes</div>
                      <div className="text-xs text-muted-foreground">
                        Save drafts anytime; finalize to publish to the patient and generate a verification hash.
                      </div>
                    </div>
                    {note?.is_final && note?.finalized_at && noteTxId ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          downloadConsultationNotesPdf({
                            patientLabel: active.patient_id,
                            txId: noteTxId,
                            payload: {
                              appointment_id: active.id,
                              note_id: note.id,
                              patient_id: note.patient_id,
                              doctor_id: note.doctor_id,
                              diagnosis: note.diagnosis ?? "",
                              recommendations: note.recommendations ?? "",
                              finalized_at: note.finalized_at,
                            },
                          });
                        }}
                      >
                        <FileDown className="mr-2 h-4 w-4" /> PDF
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Diagnosis</div>
                      <Textarea
                        value={diagnosis}
                        onChange={(e) => setDiagnosis(e.target.value)}
                        placeholder="Enter diagnosis (draft)…"
                        className="mt-2"
                        disabled={!canEditNote}
                      />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Recommendations</div>
                      <Textarea
                        value={recommendations}
                        onChange={(e) => setRecommendations(e.target.value)}
                        placeholder="Enter recommendations (draft)…"
                        className="mt-2"
                        disabled={!canEditNote}
                      />
                    </div>

                    {note?.is_final ? (
                      <div className="text-xs text-muted-foreground">
                        Finalized: {note.finalized_at ? new Date(note.finalized_at).toLocaleString() : "—"}
                        {noteTxId ? (
                          <span>
                            {" "}· tx: <span className="font-mono">{noteTxId}</span>
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        disabled={!canEditNote}
                        onClick={() => saveDraft(false)}
                      >
                        Save draft
                      </Button>
                      <Button
                        variant="hero"
                        className="rounded-xl"
                        disabled={!canEditNote}
                        onClick={() => saveDraft(true)}
                      >
                        Finalize & anchor
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="font-semibold">Chat (appointment)</div>
                <div className="max-h-64 overflow-auto rounded-2xl border bg-card p-4">
                  {messages.length ? (
                    <div className="grid gap-2">
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={`max-w-[85%] rounded-2xl border p-3 text-sm shadow-soft ${
                            m.sender_id === user?.id ? "ml-auto bg-accent" : "bg-background"
                          }`}
                        >
                          <div className="text-[11px] text-muted-foreground">{format(new Date(m.created_at), "p")}</div>
                          <div>{m.body}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No messages yet.</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Type a message…"
                    onKeyDown={(e) => e.key === "Enter" && send()}
                  />
                  <Button variant="hero" className="rounded-xl" onClick={send}>
                    Send
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
