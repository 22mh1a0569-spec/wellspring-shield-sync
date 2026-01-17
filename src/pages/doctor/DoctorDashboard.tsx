import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ClipboardCheck, Search, ShieldAlert, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PatientRow = { patient_id: string; full_name: string | null; email: string | null };

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [pending, setPending] = useState(0);
  const [upcoming, setUpcoming] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    // Pending consent requests addressed to this doctor
    supabase
      .from("doctor_patient_consents")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", user.id)
      .eq("status", "pending")
      .then(({ count }) => setPending(count ?? 0));

    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", user.id)
      .eq("status", "scheduled")
      .then(({ count }) => setUpcoming(count ?? 0));

    // List granted patients (consents table is the source of truth)
    supabase
      .from("doctor_patient_consents")
      .select("patient_id,status")
      .eq("doctor_id", user.id)
      .eq("status", "granted")
      .limit(200)
      .then(async ({ data }) => {
        const ids = (data ?? []).map((r) => r.patient_id);
        if (!ids.length) {
          setPatients([]);
          return;
        }

        const { data: profiles } = await supabase.from("profiles").select("user_id,full_name").in("user_id", ids);
        const mapName = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name] as const));

        setPatients(
          ids.map((id) => ({
            patient_id: id,
            full_name: mapName.get(id) ?? null,
            email: null,
          })),
        );
      });
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => (p.full_name ?? "").toLowerCase().includes(q) || p.patient_id.toLowerCase().includes(q));
  }, [patients, query]);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border bg-card/70 shadow-card backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="font-display text-base">Granted Patients</CardTitle>
            <div className="rounded-md bg-accent p-2 text-accent-foreground">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">{patients.length}</div>
            <p className="text-sm text-muted-foreground">Patients who granted you access.</p>
          </CardContent>
        </Card>

        <Card className="border bg-card/70 shadow-card backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="font-display text-base">Pending Requests</CardTitle>
            <div className="rounded-md bg-accent p-2 text-accent-foreground">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">{pending}</div>
            <p className="text-sm text-muted-foreground">Awaiting approval.</p>
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link to="/doctor/consent-requests">Review requests</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border bg-card/70 shadow-card backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="font-display text-base">Upcoming Appointments</CardTitle>
            <div className="rounded-md bg-accent p-2 text-accent-foreground">
              <CalendarDays className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">{upcoming}</div>
            <p className="text-sm text-muted-foreground">Scheduled consultations.</p>
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link to="/doctor/telemedicine">Open telemedicine</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border bg-card/70 shadow-card backdrop-blur-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="font-display">Patient List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" placeholder="Search by name or ID" />
              </div>
              <Button variant="hero" asChild>
                <Link to="/doctor/telemedicine">Schedule</Link>
              </Button>
            </div>

            <div className="rounded-xl border bg-background/60 shadow-soft">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length ? (
                    filtered.map((p) => (
                      <TableRow key={p.patient_id}>
                        <TableCell className="font-medium">{p.full_name ?? "Patient"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.patient_id.slice(0, 8)}…</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/doctor/patient/${p.patient_id}`}>View</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        No granted patients yet. Ask a patient to grant you access.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-card/70 shadow-card backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-display">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button asChild variant="hero">
              <Link to="/doctor/predictions">
                <ClipboardCheck className="mr-2 h-4 w-4" /> Recent predictions
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/doctor/consent-requests">Access approvals</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/doctor/telemedicine">Appointments</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
