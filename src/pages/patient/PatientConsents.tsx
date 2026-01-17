import React, { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, ShieldOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

type Consent = {
  id: string;
  doctor_id: string;
  status: string;
  created_at: string;
};

export default function PatientConsents() {
  const { user } = useAuth();
  const [doctorId, setDoctorId] = useState("");
  const [rows, setRows] = useState<Consent[]>([]);

  const refresh = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("doctor_patient_consents")
      .select("id,doctor_id,status,created_at")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false });
    setRows((data as any) ?? []);
  };

  useEffect(() => {
    refresh();
  }, [user?.id]);

  const request = async () => {
    if (!user?.id) return;
    if (!doctorId.trim()) {
      toast({ title: "Doctor ID required", description: "Paste a doctor user id (UUID).", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("doctor_patient_consents").upsert({
      patient_id: user.id,
      doctor_id: doctorId.trim(),
      status: "pending",
    });
    if (error) {
      toast({ title: "Request failed", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("notifications").insert({
      user_id: user.id,
      type: "consent",
      title: "Access request created",
      body: "A doctor can now approve your consent request.",
      href: "/patient/consents",
    });
    setDoctorId("");
    refresh();
  };

  const setStatus = async (id: string, status: "granted" | "revoked") => {
    if (!user?.id) return;
    const { error } = await supabase.from("doctor_patient_consents").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("notifications").insert({
      user_id: user.id,
      type: "consent",
      title: status === "granted" ? "Access granted" : "Access revoked",
      body: "Your consent settings were updated.",
      href: "/patient/consents",
    });
    refresh();
  };

  return (
    <div className="grid gap-6">
      <Card className="border bg-card shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Consent-Based Access Control</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              For demo: ask the doctor to share their user id and paste it here to create an access request.
            </div>
            <Input value={doctorId} onChange={(e) => setDoctorId(e.target.value)} placeholder="Doctor user id (UUID)" />
          </div>
          <Button variant="hero" onClick={request} className="rounded-xl">
            Request access
          </Button>
        </CardContent>
      </Card>

      <Card className="border bg-card shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Your consents</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {rows.length ? (
            rows.map((r) => (
              <div key={r.id} className="flex flex-col gap-3 rounded-2xl border bg-background p-5 shadow-soft md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 font-medium">
                    <ShieldCheck className="h-4 w-4" /> Doctor: <span className="font-mono text-sm">{r.doctor_id.slice(0, 8)}…</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Status: <span className="font-medium text-foreground">{r.status}</span> • Created {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setStatus(r.id, "granted")} disabled={r.status === "granted"}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Grant
                  </Button>
                  <Button variant="soft" size="sm" className="rounded-xl" onClick={() => setStatus(r.id, "revoked")}>
                    <ShieldOff className="mr-2 h-4 w-4" /> Revoke
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground shadow-soft">No consent requests yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
