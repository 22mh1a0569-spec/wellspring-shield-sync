import React from "react";
import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";

export function HealthChainBrand({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-11 w-11" : "h-12 w-12";
  const icon = size === "sm" ? "h-5 w-5" : "h-5 w-5";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          box,
          "grid place-items-center rounded-2xl shadow-soft",
          "bg-[linear-gradient(135deg,hsl(var(--brand-teal)),hsl(var(--brand-teal-2)),hsl(var(--brand-orange)))]",
        )}
        aria-hidden="true"
      >
        <Heart className={cn(icon, "text-primary-foreground")} strokeWidth={2.2} />
      </div>
      <div className="leading-tight">
        <div className="font-display text-xl font-semibold tracking-tight">HealthChain</div>
        <div className="text-sm text-muted-foreground">AI-Powered Healthcare</div>
      </div>
    </div>
  );
}
