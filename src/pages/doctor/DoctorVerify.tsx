import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { QrCode, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const txSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^tx_[A-Za-z0-9_-]{3,}$/);

function normalizeTxId(value: string) {
  return value.trim();
}

export default function DoctorVerify() {
  const navigate = useNavigate();
  const [txId, setTxId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(() => {
    setError(null);
    const parsed = txSchema.safeParse(normalizeTxId(txId));
    if (!parsed.success) {
      setError("Enter a valid transaction ID (e.g., tx_abc123).");
      return;
    }
    navigate(`/doctor/verify/${parsed.data}`);
  }, [navigate, txId]);

  const scanLinkState = useMemo(() => ({ from: "/doctor/verify" }), []);

  return (
    <main className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Verify a report</h1>
        <p className="text-sm text-muted-foreground">
          Paste a transaction ID or scan a QR code to verify a report hash against the ledger. Detailed report data is gated by
          patient consent.
        </p>
      </header>

      <Card className="border bg-card shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Blockchain verification</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-2xl border bg-background p-6 shadow-soft">
            <div className="text-sm font-semibold">Transaction</div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                placeholder="tx_…"
                className="flex-1"
                inputMode="text"
              />
              <Button variant="hero" className="rounded-xl" onClick={submit}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Verify
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/verify" state={scanLinkState}>
                  <QrCode className="mr-2 h-4 w-4" /> Scan QR
                </Link>
              </Button>
            </div>
            {error ? <div className="mt-2 text-sm text-destructive">{error}</div> : null}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
