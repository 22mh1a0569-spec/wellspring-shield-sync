import React, { useEffect, useState } from "react";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

type Appointment = {
  id: string;
  doctor_id: string;
  patient_id: string;
  scheduled_for: string;
  status: string;
  reason: string | null;
};

type Availability = { doctor_id: string; is_available: boolean };

type Msg = { id: string; sender_id: string; body: string; created_at: string };

export default function PatientTelemedicine() {
  const { user } = useAuth();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [doctorId, setDoctorId] = useState("");
  const [reason, setReason] = useState("");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [active, setActive] = useState<Appointment | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [message, setMessage] = useState("");

  const refreshAppointments = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("appointments")
      .select("id,doctor_id,patient_id,scheduled_for,status,reason")
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
      return;
    }

    supabase
      .from("chat_messages")
      .select("id,sender_id,body,created_at")
      .eq("appointment_id", active.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data as any) ?? []));

    const channel = supabase
      .channel(`chat:${active.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `appointment_id=eq.${active.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as any]);
        },
      )
      .subscribe();

    return () => {
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
    const { data: avail } = await supabase.from("doctor_availability").select("doctor_id,is_available").eq("doctor_id", doctorId.trim()).maybeSingle();
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
      .select("id,doctor_id,patient_id,scheduled_for,status,reason")
      .single();

    if (error) {
      toast({ title: "Booking failed", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("notifications").insert({
      user_id: user.id,
      type: "appointment",
      title: "Appointment booked",
      body: `Scheduled for ${format(scheduled, "PP")}`,
      href: "/patient/telemedicine",
    });

    toast({ title: "Booked", description: "Appointment scheduled." });
    setDoctorId("");
    setReason("");
    await refreshAppointments();
    setActive(data as any);
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

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border bg-card shadow-card md:col-span-1">
          <CardHeader>
            <CardTitle className="font-display">Book appointment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-2xl border bg-background shadow-soft" />
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
                  <div className="mt-1 text-xs text-muted-foreground">Doctor: {a.doctor_id.slice(0, 8)}…</div>
                  {a.reason ? <div className="mt-2 text-sm">{a.reason}</div> : null}
                </button>
              ))
            ) : (
              <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground shadow-soft">No appointments yet.</div>
            )}

            {active ? (
              <div className="mt-4 grid gap-3 rounded-2xl border bg-background p-5 shadow-soft">
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
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
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
