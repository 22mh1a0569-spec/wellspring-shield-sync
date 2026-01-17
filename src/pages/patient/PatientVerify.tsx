import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function PatientVerify() {
  const nav = useNavigate();
  const [txId, setTxId] = useState("");

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Blockchain Verify</h1>
        <p className="mt-1 text-sm text-muted-foreground">Paste a transaction ID to verify a report.</p>
      </section>

      <Card className="rounded-2xl border bg-card shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Verify Transaction
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="Enter transaction ID (txId)" />
          <Button
            variant="hero"
            className="rounded-xl"
            onClick={() => {
              const t = txId.trim();
              if (!t) return;
              nav(`/verify/${encodeURIComponent(t)}`);
            }}
          >
            Verify
          </Button>
          <p className="text-xs text-muted-foreground">Tip: You can get the transaction ID from your Prediction History.</p>
        </CardContent>
      </Card>
    </div>
  );
}
