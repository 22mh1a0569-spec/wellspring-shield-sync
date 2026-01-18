import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  ClipboardCheck,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Stethoscope,
  CalendarDays,
  FileText,
  BadgeCheck,
  Video,
} from "lucide-react";

import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserSidebarCard } from "@/components/UserSidebarCard";

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { role, signOut, user } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .then(({ count }) => setUnread(count ?? 0));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      return;
    }

    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data ? { full_name: data.full_name ?? null, avatar_url: (data as any).avatar_url ?? null } : null));
  }, [user?.id]);

  const nav = useMemo<NavItem[]>(() => {
    if (role === "doctor") {
      return [
        { to: "/doctor", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
        { to: "/doctor/telemedicine", label: "Telemedicine", icon: <Video className="h-4 w-4" /> },
        { to: "/doctor/predictions", label: "Predictions", icon: <ClipboardCheck className="h-4 w-4" /> },
      ];
    }

    return [
      { to: "/patient", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
      { to: "/patient/predict", label: "AI Prediction", icon: <HeartPulse className="h-4 w-4" /> },
      { to: "/patient/records", label: "Medical Records", icon: <FileText className="h-4 w-4" /> },
      { to: "/patient/verify", label: "Blockchain Verify", icon: <BadgeCheck className="h-4 w-4" /> },
      { to: "/patient/telemedicine", label: "Appointments", icon: <CalendarDays className="h-4 w-4" /> },
      { to: "/patient/consents", label: "Access Control", icon: <ShieldCheck className="h-4 w-4" /> },
    ];
  }, [role]);

  const title = useMemo(() => {
    if (role === "doctor") return "Doctor Console";
    if (role === "patient") return "Patient Workspace";
    return "Workspace";
  }, [role]);

  return (
      <SidebarProvider defaultOpen>
        <Sidebar variant="floating" collapsible="icon" className="bg-transparent">
          <SidebarHeader>
            <div className="flex items-center gap-2 rounded-2xl border bg-card p-3 shadow-soft">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground shadow-soft bg-[linear-gradient(135deg,hsl(var(--brand-teal)),hsl(var(--brand-teal-2)),hsl(var(--brand-orange)))]"
                aria-hidden="true"
              >
                {role === "doctor" ? <Stethoscope className="h-4 w-4" /> : <HeartPulse className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <div className="truncate font-display text-sm font-semibold">HealthChain</div>
                <div className="truncate text-xs text-muted-foreground">{title}</div>
              </div>
            </div>
          </SidebarHeader>

          <SidebarSeparator />

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="px-1 text-[11px] tracking-wide">Menu</SidebarGroupLabel>
              <SidebarMenu className="gap-1.5">
                {nav.map((item) => {
                  const active = location.pathname === item.to;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        size="lg"
                        className="rounded-xl hover-scale"
                      >
                        <Link to={item.to} className="gap-3">
                          {item.icon}
                          <span className="text-sm">{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

            <SidebarFooter>
              <div className="grid w-full gap-2">
                <UserSidebarCard
                  userId={user?.id ?? null}
                  name={profile?.full_name ?? null}
                  avatarUrl={profile?.avatar_url ?? null}
                  email={user?.email ?? null}
                  role={role ?? null}
                  onProfileUpdated={(next) =>
                    setProfile((prev) => ({
                      full_name: prev?.full_name ?? null,
                      avatar_url: next.avatarUrl ?? prev?.avatar_url ?? null,
                    }))
                  }
                />

                <Button variant="outline" className="h-11 w-full justify-between rounded-xl" asChild>
                  <Link to={role === "doctor" ? "/doctor/notifications" : "/patient/notifications"}>
                    <span className="inline-flex items-center gap-2">
                      <Bell className="h-4 w-4" /> Notifications
                    </span>
                    {unread ? <Badge variant="secondary">{unread}</Badge> : <span />}
                  </Link>
                </Button>

                <Button
                  variant="soft"
                  onClick={async () => {
                    await signOut();
                  }}
                  className="h-11 w-full justify-between rounded-xl"
                >
                  <span className="inline-flex items-center gap-2">
                    <LogOut className="h-4 w-4" /> Sign out
                  </span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">{user?.email}</span>
                </Button>
              </div>
            </SidebarFooter>
        </Sidebar>

        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 border-b bg-background/70 backdrop-blur-sm">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <div>
                  <div className="font-display text-sm font-semibold">{title}</div>
                  <div className="text-xs text-muted-foreground">Consent-first. Verifiable. Demo-ready.</div>
                </div>
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <Badge variant="secondary">Role: {role ?? "…"}</Badge>
              </div>
            </div>
          </header>

          <div className="min-h-[calc(100svh-56px)] bg-hero">
            <div className="mx-auto max-w-7xl px-4 py-6 animate-fade-in">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
  );
}
