import React, { useEffect, useRef, useState } from "react";
import { format, startOfDay } from "date-fns";
import { FileDown } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { downloadConsultationNotesPdf } from "@/lib/pdf/consultationNotesPdf";

type Appointment = {
  id: string;
  doctor_id: string;
  patient_id: string;
  scheduled_for: string;
  status: string;
  started_at?: string | null;
  ended_at?: string | null;
  reason: string | null;
};

type Availability = { doctor_id: string; is_available: boolean };

type Msg = { id: string; sender_id: string; body: string; created_at: string };

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

function formatTimer(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function PatientTelemedicine() {
  const { user } = useAuth();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [doctorId, setDoctorId] = useState("");
  const [reason, setReason] = useState("");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [active, setActive] = useState<Appointment | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [message, setMessage] = useState("");

  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "connected" | "disconnected" | "error"
  >("idle");
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const chatChannelRef = useRef<any>(null);

  const [secondsActive, setSecondsActive] = useState(0);

  const [note, setNote] = useState<NoteRow | null>(null);
  const [noteTxId, setNoteTxId] = useState<string | null>(null);

  const refreshAppointments = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("appointments")
      .select("id,doctor_id,patient_id,scheduled_for,status,started_at,ended_at,reason")
      .eq("patient_id", user.id)
      .order("scheduled_for", { ascending: true });
    setAppointments((data as any) ?? []);
  };

  useEffect(() => {
    refreshAppointments();
  }, [user?.id]);

  useEffect(() => {
    if (!active?.id || !user?.id) {
      setMessages([]);
      setNote(null);
      setNoteTxId(null);
      setConnectionStatus("idle");
      setIsOtherTyping(false);
      setSecondsActive(0);
      return;
    }

    // Refresh active appointment status periodically (keeps UI in sync without relying on realtime publication)
    let alive = true;
    const fetchActive = async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id,doctor_id,patient_id,scheduled_for,status,started_at,ended_at,reason")
        .eq("id", active.id)
        .maybeSingle();
      if (!alive || !data) return;
      setActive((prev) => (prev?.id === (data as any).id ? ({ ...(prev as any), ...(data as any) } as any) : prev));
    };
    fetchActive();
    const poll = window.setInterval(fetchActive, 5000);

    supabase
      .from("chat_messages")
      .select("id,sender_id,body,created_at")
      .eq("appointment_id", active.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data as any) ?? []));

    // Load finalized consultation notes (patient can only read when finalized via RLS)
    supabase
      .from("appointment_notes")
      .select("id,appointment_id,doctor_id,patient_id,diagnosis,recommendations,is_final,finalized_at")
      .eq("appointment_id", active.id)
      .maybeSingle()
      .then(async ({ data }) => {
        const n = (data as any) as NoteRow | null;
        setNote(n);
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

    setConnectionStatus(navigator.onLine ? "connecting" : "disconnected");

    const channel = supabase
      .channel(`chat:${active.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `appointment_id=eq.${active.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as any]);
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.userId === user.id) return;
        setIsOtherTyping(!!payload.isTyping);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionStatus(navigator.onLine ? "connected" : "disconnected");
        else if (status === "CHANNEL_ERROR") setConnectionStatus("error");
        else if (status === "TIMED_OUT") setConnectionStatus("error");
        else if (status === "CLOSED") setConnectionStatus("disconnected");
      });

    chatChannelRef.current = channel;

    const onOnline = () => setConnectionStatus("connecting");
    const onOffline = () => setConnectionStatus("disconnected");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      alive = false;
      window.clearInterval(poll);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      chatChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [active?.id, user?.id]);

  const book = async () => {
    if (!user?.id) return;
    if (!doctorId.trim()) {
      toast({ title: "Doctor ID required", description: "Paste the doctor user id (UUID).", variant: "destructive" });
      return;
    }
    if (!date) return;

    // Basic check: doctor is available OR allow booking anyway (MVP)
    const { data: avail } = await supabase
      .from("doctor_availability")
      .select("doctor_id,is_available")
      .eq("doctor_id", doctorId.trim())
      .maybeSingle();
    if ((avail as Availability | null)?.is_available === false) {
      toast({ title: "Doctor unavailable", description: "This doctor has availability toggled off.", variant: "destructive" });
      return;
    }

    const scheduled = new Date(date);
    scheduled.setHours(10, 0, 0, 0);

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        patient_id: user.id,
        doctor_id: doctorId.trim(),
        scheduled_for: scheduled.toISOString(),
        reason: reason || null,
      })
      .select("id,doctor_id,patient_id,scheduled_for,status,started_at,ended_at,reason")
      .single();

    if (error) {
      toast({ title: "Booking failed", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("notifications").insert([
      {
        user_id: user.id,
        type: "appointment",
        title: "Appointment booked",
        body: `Scheduled for ${format(scheduled, "PP")}`,
        href: "/patient/telemedicine",
      },
      {
        user_id: doctorId.trim(),
        type: "appointment",
        title: "New appointment booked",
        body: `Scheduled for ${format(scheduled, "PPp")} · Patient: ${user.id.slice(0, 8)}…`,
        href: "/doctor/telemedicine",
      },
    ]);

    toast({ title: "Booked", description: "Appointment scheduled." });
    setDoctorId("");
    setReason("");
    await refreshAppointments();
    setActive(data as any);
  };

  const send = async () => {
    if (!user?.id || !active?.id) return;
    if (active.status !== "in_consultation") return;
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

  const today = startOfDay(new Date());

  useEffect(() => {
    if (!active?.id || active.status !== "in_consultation" || !active.started_at) {
      setSecondsActive(0);
      return;
    }

    const startedMs = Date.parse(active.started_at);
    if (!Number.isFinite(startedMs)) return;

    const tick = () => {
      setSecondsActive(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
    };

    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [active?.id, active?.status, active?.started_at]);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border bg-card shadow-card md:col-span-1">
          <CardHeader>
            <CardTitle className="font-display">Book appointment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              disabled={(d) => d < today}
              className="rounded-2xl border bg-background shadow-soft"
            />
            <Input value={doctorId} onChange={(e) => setDoctorId(e.target.value)} placeholder="Doctor user id (UUID)" />
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" />
            <Button variant="hero" className="rounded-xl" onClick={book}>
              Book
            </Button>
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-card md:col-span-2">
          <CardHeader>
            <CardTitle className="font-display">Your appointments</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {appointments.length ? (
              appointments.map((a) => {
                const isActive = active?.id === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setActive(a)}
                    className={`w-full rounded-2xl border bg-background p-5 text-left shadow-soft transition hover:-translate-y-0.5 ${
                      isActive ? "ring-2 ring-ring" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{format(new Date(a.scheduled_for), "PPp")}</div>
                      <div className="text-xs text-muted-foreground">{a.status}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Doctor: {a.doctor_id.slice(0, 8)}…</div>
                    {a.reason ? <div className="mt-2 text-sm">{a.reason}</div> : null}
                  </button>
                );
              })
            ) : (
              <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground shadow-soft">No appointments yet.</div>
            )}

            {active ? (
              <div className="mt-4 grid gap-3 rounded-2xl border bg-background p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">Chat (appointment)</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Status: {active.status}</span>
                    <span>
                      Connection: {connectionStatus === "connected" ? "Live" : connectionStatus === "connecting" ? "Connecting…" : connectionStatus}
                    </span>
                    {active.status === "in_consultation" && active.started_at ? (
                      <span>Timer: {formatTimer(secondsActive)}</span>
                    ) : null}
                  </div>
                </div>
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

                {active.status === "in_consultation" ? (
                  <div className="grid gap-2">
                    {isOtherTyping ? (
                      <div className="text-xs text-muted-foreground">Doctor is typing…</div>
                    ) : null}
                    <div className="flex gap-2">
                      <Input
                        value={message}
                        onChange={(e) => {
                          const next = e.target.value;
                          setMessage(next);

                          const ch = chatChannelRef.current;
                          if (!ch || !active?.id || !user?.id) return;

                          if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
                          ch.send({
                            type: "broadcast",
                            event: "typing",
                            payload: { userId: user.id, isTyping: true },
                          });
                          typingTimeoutRef.current = window.setTimeout(() => {
                            ch.send({
                              type: "broadcast",
                              event: "typing",
                              payload: { userId: user.id, isTyping: false },
                            });
                          }, 1200);
                        }}
                        placeholder="Type a message…"
                        onKeyDown={(e) => e.key === "Enter" && send()}
                      />
                      <Button variant="hero" className="rounded-xl" onClick={send}>
                        Send
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
                    Chat will unlock when the doctor starts the consultation.
                  </div>
                )}


                <div className="mt-2 rounded-2xl border bg-card p-4 shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Doctor notes</div>
                      <div className="text-xs text-muted-foreground">Visible after the doctor finalizes the consultation.</div>
                    </div>
                    {note?.is_final && note?.finalized_at ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          if (!user?.email || !noteTxId) return;
                          downloadConsultationNotesPdf({
                            patientLabel: user.email,
                            txId: noteTxId,
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
                        }}
                      >
                        <FileDown className="mr-2 h-4 w-4" /> PDF
                      </Button>
                    ) : null}
                  </div>

                  {note?.is_final ? (
                    <div className="mt-3 grid gap-3">
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground">Diagnosis</div>
                        <div className="mt-1 text-sm">{note.diagnosis || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground">Recommendations</div>
                        <div className="mt-1 text-sm">{note.recommendations || "—"}</div>
                      </div>
                      {noteTxId ? (
                        <div className="text-xs text-muted-foreground">Verification tx: <span className="font-mono">{noteTxId}</span></div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-muted-foreground">No finalized notes for this appointment yet.</div>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

