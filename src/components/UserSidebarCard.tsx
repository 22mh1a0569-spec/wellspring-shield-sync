import React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function initialsFromName(name?: string | null) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function UserSidebarCard({
  name,
  email,
  role,
  className,
}: {
  name?: string | null;
  email?: string | null;
  role?: string | null;
  className?: string;
}) {
  const displayName = name?.trim() || (email ? email.split("@")[0] : "User");
  const subtitle = email || "";

  return (
    <div className={cn("rounded-2xl border bg-card p-3 shadow-soft", className)}>
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 rounded-2xl">
          <AvatarFallback className="rounded-2xl bg-muted font-medium">
            {initialsFromName(displayName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm font-semibold">{displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>

        {role ? (
          <Badge variant="secondary" className="shrink-0">
            {role}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
