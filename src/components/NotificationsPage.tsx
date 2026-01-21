import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  is_read: boolean;
  created_at: string;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

export default function NotificationsPage({ role }: { role: "doctor" | "patient" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("notifications")
      .select("id,type,title,body,href,is_read,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setError(error.message);
      setItems([]);
    } else {
      setItems((data ?? []) as NotificationRow[]);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    // Optimistic UI
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
  }, [user?.id]);

  const openNotification = useCallback(
    async (n: NotificationRow) => {
      if (user?.id && !n.is_read) {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
        await supabase.from("notifications").update({ is_read: true }).eq("id", n.id).eq("user_id", user.id);
      }

      if (n.href) {
        navigate(n.href);
      }
    },
    [navigate, user?.id]
  );

  return (
    <main className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Updates about consultations, reports, and access control.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={unreadCount ? "secondary" : "outline"}>{unreadCount} unread</Badge>
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={!unreadCount}>
            Mark all read
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to={role === "doctor" ? "/doctor" : "/patient"}>Back</Link>
          </Button>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Could not load notifications</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        {loading ? (
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Loading…</div>
          </Card>
        ) : items.length === 0 ? (
          <Card className="p-6">
            <div className="text-sm text-muted-foreground">No notifications yet.</div>
          </Card>
        ) : (
          items.map((n) => (
            <Card key={n.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate font-medium">{n.title}</div>
                    {!n.is_read ? <Badge variant="secondary">New</Badge> : null}
                    <Badge variant="outline" className="capitalize">
                      {n.type}
                    </Badge>
                  </div>
                  {n.body ? <p className="mt-1 text-sm text-muted-foreground">{n.body}</p> : null}
                  <div className="mt-3 text-xs text-muted-foreground">{formatWhen(n.created_at)}</div>
                </div>
                <div className="shrink-0">
                  <Button variant={n.href ? "default" : "outline"} size="sm" onClick={() => void openNotification(n)}>
                    {n.href ? "Open" : "Mark read"}
                  </Button>
                </div>
              </div>
              <Separator className="mt-4" />
              {n.href ? (
                <div className="mt-3 text-xs text-muted-foreground">Link: {n.href}</div>
              ) : (
                <div className="mt-3 text-xs text-muted-foreground">No link attached.</div>
              )}
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
