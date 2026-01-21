import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { BrowserMultiFormatReader } from "@zxing/browser";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const txSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^tx_[A-Za-z0-9_-]{3,}$/);

function extractTxId(payload: string): string | null {
  const raw = payload.trim();
  if (!raw) return null;

  // If QR embeds a URL like https://.../verify/tx_abc123
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "verify");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  } catch {
    // not a URL
  }

  // Otherwise accept raw tx_id
  return raw;
}

export default function VerifyScan() {
  const navigate = useNavigate();
  const location = useLocation();

  const [txId, setTxId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraHint, setCameraHint] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const fromPath = useMemo(() => {
    const st = location.state as any;
    return typeof st?.from === "string" ? st.from : null;
  }, [location.state]);

  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // ignore
    }
    controlsRef.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setCameraHint(null);
    setScanning(true);

    const el = videoRef.current;
    if (!el) {
      setError("Camera preview not available.");
      setScanning(false);
      return;
    }

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    try {
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        },
        el,
        (result, err) => {
          if (result) {
            const payload = result.getText();
            const extracted = extractTxId(payload);
            if (extracted) {
              setTxId(extracted);
              setError(null);
              stop();
            } else {
              setError("QR code read, but no transaction ID was found.");
            }
            return;
          }

          // Ignore the common "no QR found yet" noise; surface other errors.
          const name = (err as any)?.name;
          if (err && name && name !== "NotFoundException") {
            setError("Could not read QR code. Try adjusting lighting or distance.");
          }
        },
      );

      controlsRef.current = controls as any;

      // If autoplay is blocked or stream failed to attach, surface a helpful hint.
      window.setTimeout(() => {
        const v = videoRef.current;
        if (!v || !scanning) return;
        if ((v.videoWidth ?? 0) === 0) {
          setCameraHint(
            "If the preview is black, check browser camera permissions (and try Safari on iPhone / Chrome on Android).",
          );
        }
      }, 1200);
    } catch (e: any) {
      setError(e?.message ?? "Could not access camera.");
      setScanning(false);
    }
  }, [scanning, stop]);

  useEffect(() => stop, [stop]);

  const submit = useCallback(() => {
    setError(null);
    const extracted = extractTxId(txId);
    const parsed = txSchema.safeParse(extracted);
    if (!parsed.success) {
      setError("Please enter a valid transaction ID (e.g., tx_abc123).");
      return;
    }
    navigate(`/verify/${parsed.data}`, { state: fromPath ? { from: fromPath } : undefined });
  }, [fromPath, navigate, txId]);

  return (
    <div className="min-h-screen bg-hero">
      <div className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">
        <Card className="border bg-card shadow-card">
          <CardHeader>
            <CardTitle className="font-display">Scan & Verify</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-2xl border bg-background p-6 shadow-soft">
              <div className="text-sm font-semibold">Verification transaction</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={txId}
                  onChange={(e) => setTxId(e.target.value)}
                  placeholder="Paste tx_id or scan QR"
                  className="flex-1"
                  inputMode="text"
                />
                <Button variant="hero" className="rounded-xl" onClick={submit}>
                  Verify
                </Button>
              </div>
              {error ? <div className="mt-2 text-sm text-destructive">{error}</div> : null}
            </div>

            <div className="rounded-2xl border bg-background p-6 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">QR scanner</div>
                  <div className="text-xs text-muted-foreground">
                    Allow camera access to scan a verification QR code.
                  </div>
                </div>
                <div className="flex gap-2">
                  {!scanning ? (
                    <Button variant="outline" className="rounded-xl" onClick={start}>
                      Start scan
                    </Button>
                  ) : (
                    <Button variant="outline" className="rounded-xl" onClick={stop}>
                      Stop
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
                <video
                  ref={videoRef}
                  className="h-[320px] w-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />
              </div>

              {cameraHint ? <div className="mt-3 text-xs text-muted-foreground">{cameraHint}</div> : null}

              <div className="mt-3 text-xs text-muted-foreground">
                Tip: On iPhone, use Safari and tap “Allow” when prompted.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
