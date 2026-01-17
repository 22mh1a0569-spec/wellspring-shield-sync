import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Tx = {
  tx_id: string;
  payload_hash: string;
  prev_hash: string | null;
  created_at: string;
  prediction_id: string;
  patient_id: string;
};

type Pred = {
  created_at: string;
  risk_percentage: number;
  risk_category: string;
  health_score: number;
  input: any;
};

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function VerifyRecord() {
  const { txId = "" } = useParams();
  const [tx, setTx] = useState<Tx | null>(null);
  const [pred, setPred] = useState<Pred | null>(null);
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "notfound">("loading");

  useEffect(() => {
    const run = async () => {
      const { data: txRow } = await supabase
        .from("ledger_transactions")
        .select("tx_id,payload_hash,prev_hash,created_at,prediction_id,patient_id")
        .eq("tx_id", txId)
        .maybeSingle();

      if (!txRow) {
        setStatus("notfound");
        return;
      }

      setTx(txRow as any);

      const { data: predRow } = await supabase
        .from("predictions")
        .select("created_at,risk_percentage,risk_category,health_score,input")
        .eq("id", (txRow as any).prediction_id)
        .maybeSingle();

      if (!predRow) {
        setStatus("invalid");
        return;
      }
      setPred(predRow as any);

      const payload = JSON.stringify({
        input: (predRow as any).input,
        risk: { risk: (predRow as any).risk_percentage, category: (predRow as any).risk_category },
        score: (predRow as any).health_score,
        at: (predRow as any).created_at,
        patient_id: (txRow as any).patient_id,
      });
      const computed = await sha256(payload);

      setStatus(computed === (txRow as any).payload_hash ? "valid" : "invalid");
    };

    run();
  }, [txId]);

  const banner = useMemo(() => {
    if (status === "valid") return { title: "Verified", desc: "The record hash matches the ledger transaction." };
    if (status === "invalid") return { title: "Not verified", desc: "The record does not match the stored hash." };
    if (status === "notfound") return { title: "Transaction not found", desc: "No ledger transaction matches this ID." };
    return { title: "Verifying…", desc: "Computing hash and validating." };
  }, [status]);

  return (
    <div className="min-h-screen bg-hero">
      <div className="mx-auto max-w-4xl px-6 py-10 animate-fade-in">
        <Card className="border bg-card/70 shadow-card backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-display">Blockchain Verification</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-xl border bg-background/60 p-5 shadow-soft">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" /> {banner.title}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{banner.desc}</div>
            </div>

            {tx ? (
              <div className="rounded-xl border bg-background/60 p-5 shadow-soft">
                <div className="text-xs text-muted-foreground">Transaction ID</div>
                <div className="mt-1 font-mono text-sm">{tx.tx_id}</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Payload hash</div>
                    <div className="mt-1 break-all font-mono text-xs">{tx.payload_hash}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Previous hash</div>
                    <div className="mt-1 break-all font-mono text-xs">{tx.prev_hash ?? "(genesis)"}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {pred ? (
              <div className="rounded-xl border bg-background/60 p-5 shadow-soft">
                <div className="text-sm font-medium">Report snapshot</div>
                <div className="mt-2 grid gap-2 text-sm">
                  <div>
                    Risk: <span className="font-medium">{pred.risk_percentage}% ({pred.risk_category})</span>
                  </div>
                  <div>
                    Score: <span className="font-medium">{pred.health_score}/100</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Created: {new Date(pred.created_at).toLocaleString()}</div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
