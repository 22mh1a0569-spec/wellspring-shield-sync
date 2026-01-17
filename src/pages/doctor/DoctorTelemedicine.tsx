import React, { useEffect, useState } from "react";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

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

export default function DoctorTelemedicine() {
  const { user } = useAuth();
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [active, setActive] = useState<Appointment | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [message, setMessage] = useState("");

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
