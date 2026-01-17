import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/providers/AuthProvider";

export default function ProtectedRoute({
  allow,
  children,
}: {
  allow?: AppRole[];
  children: React.ReactNode;
}) {
  const { loading, session, role } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-hero">
        <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6">
          <div className="w-full rounded-xl border bg-card/70 p-8 shadow-card backdrop-blur-sm animate-fade-in">
            <div className="font-display text-xl font-semibold">Loading…</div>
            <p className="mt-2 text-muted-foreground">Securing your session and permissions.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  if (allow?.length && role && !allow.includes(role)) {
    return <Navigate to={role === "doctor" ? "/doctor" : "/patient"} replace />;
  }

  return <>{children}</>;
}
