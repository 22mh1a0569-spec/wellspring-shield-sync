import React from "react";
import { Camera } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function initialsFromName(name?: string | null) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

function extFromFile(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  const fromType = file.type.split("/").pop()?.toLowerCase();
  return fromType || "png";
}

export function UserSidebarCard({
  userId,
  name,
  email,
  role,
  avatarUrl,
  onProfileUpdated,
  className,
}: {
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
  onProfileUpdated?: (next: { name?: string | null; avatarUrl?: string | null }) => void;
  className?: string;
}) {
  const displayName = name?.trim() || (email ? email.split("@")[0] : "User");
  const subtitle = email || "";
  const [localAvatar, setLocalAvatar] = React.useState<string | null>(avatarUrl ?? null);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setLocalAvatar(avatarUrl ?? null);
  }, [avatarUrl]);

  const uploadAvatar = async (file: File) => {
    if (!userId) return;
    setUploading(true);
    try {
      const ext = extFromFile(file);
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data.publicUrl;

      // Update or create profile row
      const { data: updated, error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", userId)
        .select("user_id")
        .maybeSingle();

      if (updateError) throw updateError;

      if (!updated) {
        const { error: insertError } = await supabase.from("profiles").insert({ user_id: userId, avatar_url: publicUrl });
        if (insertError) throw insertError;
      }

      setLocalAvatar(publicUrl);
      onProfileUpdated?.({ avatarUrl: publicUrl });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("rounded-2xl border bg-card p-3 shadow-soft", className)}>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar className="h-10 w-10 rounded-2xl">
            {localAvatar ? <AvatarImage src={localAvatar} alt={`${displayName} avatar`} /> : null}
            <AvatarFallback className="rounded-2xl bg-muted font-medium">
              {initialsFromName(displayName)}
            </AvatarFallback>
          </Avatar>

          {userId ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAvatar(f);
                  e.currentTarget.value = "";
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute -bottom-2 -right-2 h-7 w-7 rounded-xl border bg-background/80 backdrop-blur-sm"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                title={uploading ? "Uploading…" : "Change avatar"}
              >
                <Camera className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>

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
