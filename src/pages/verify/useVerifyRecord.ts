import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/providers/AuthProvider";
import { sha256 } from "./verifyCrypto";

type Tx = {
  tx_id: string;
  payload_hash: string;
  prev_hash: string | null;
  created_at: string;
  prediction_id: string | null;
  note_id: string | null;
  appointment_id: string | null;
  patient_id: string;
};

type Pred = {
  created_at: string;
  risk_percentage: number;
  risk_category: string;
  health_score: number;
  input: any;
};

type Note = {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  diagnosis: string | null;
  recommendations: string | null;
  finalized_at: string | null;
};

type TxMeta = {
  tx_id: string;
  created_at: string;
  patient_id: string;
  prediction_id: string | null;
  note_id: string | null;
  appointment_id: string | null;
};

export type VerifyStatus =
  | "loading"
  | "valid"
  | "invalid"
  | "auth_required"
  | "no_access"
  | "consent_required"
  | "consent_pending";

function buildPredictionPayload(tx: Tx, pred: Pred) {
  return JSON.stringify({
    input: pred.input,
    risk: { risk: pred.risk_percentage, category: pred.risk_category },
    score: pred.health_score,
    at: pred.created_at,
    patient_id: tx.patient_id,
  });
}

function buildNotePayload(note: {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  diagnosis: string | null;
  recommendations: string | null;
  finalized_at: string | null;
}, finalizedAtFallback: string) {
  const finalizedAt = note.finalized_at ?? finalizedAtFallback;
  return JSON.stringify({
    appointment_id: note.appointment_id,
    note_id: note.id,
    patient_id: note.patient_id,
    doctor_id: note.doctor_id,
    diagnosis: note.diagnosis ?? "",
    recommendations: note.recommendations ?? "",
    finalized_at: finalizedAt,
  });
}

async function fetchTxWithRls(txId: string) {
  const { data } = await supabase
    .from("ledger_transactions")
    .select(
      "tx_id,payload_hash,prev_hash,created_at,prediction_id,note_id,appointment_id,patient_id",
    )
    .eq("tx_id", txId)
    .maybeSingle();
  return (data as Tx | null) ?? null;
}

async function fetchTxMetaForDoctor(txId: string) {
  const { data } = await supabase.rpc("get_ledger_tx_meta_for_doctor", { _tx_id: txId });
  const first = Array.isArray(data) ? data[0] : null;
  return (first as TxMeta | null) ?? null;
}

async function fetchConsentStatus(params: { patientId: string; doctorId: string }) {
  const { patientId, doctorId } = params;
  const { data } = await supabase
    .from("doctor_patient_consents")
    .select("status")
    .eq("patient_id", patientId)
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.status as string | undefined) ?? null;
}

export function useVerifyRecord(params: {
  txId: string;
  sessionUserId: string | null;
  role: AppRole | null;
  authLoading: boolean;
}) {
  const { txId, sessionUserId, role, authLoading } = params;

  const [tx, setTx] = useState<Tx | null>(null);
  const [pred, setPred] = useState<Pred | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [meta, setMeta] = useState<TxMeta | null>(null);
  const [status, setStatus] = useState<VerifyStatus>("loading");

  const [patientLabel, setPatientLabel] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const run = useCallback(async () => {
    setTx(null);
    setPred(null);
    setNote(null);
    setMeta(null);
    setPatientLabel(null);
    stopPolling();

    if (authLoading) return;

    if (!sessionUserId) {
      setStatus("auth_required");
      return;
    }

    setStatus("loading");

    const txRow = await fetchTxWithRls(txId);
    if (!txRow) {
      if (role === "doctor") {
        const m = await fetchTxMetaForDoctor(txId);
        if (!m) {
          setStatus("no_access");
          return;
        }
        setMeta(m);

        const consent = await fetchConsentStatus({ patientId: m.patient_id, doctorId: sessionUserId });
        setStatus(consent === "pending" ? "consent_pending" : "consent_required");
        return;
      }

      setStatus("no_access");
      return;
    }

    setTx(txRow);

    if (role === "doctor") {
      const { data: label } = await supabase.rpc("get_patient_label_for_doctor", { _patient_id: txRow.patient_id });
      setPatientLabel((label as any) ?? null);
    }

    if (txRow.prediction_id) {
      const { data: predRow } = await supabase
        .from("predictions")
        .select("created_at,risk_percentage,risk_category,health_score,input")
        .eq("id", txRow.prediction_id)
        .maybeSingle();

      if (!predRow) {
        setStatus("no_access");
        return;
      }

      const predTyped = predRow as Pred;
      setPred(predTyped);

      const computed = await sha256(buildPredictionPayload(txRow, predTyped));
      setStatus(computed === txRow.payload_hash ? "valid" : "invalid");
      return;
    }

    if (txRow.note_id) {
      const { data: noteRow } = await supabase
        .from("appointment_notes")
        .select("id,appointment_id,doctor_id,patient_id,diagnosis,recommendations,finalized_at")
        .eq("id", txRow.note_id)
        .maybeSingle();

      if (!noteRow) {
        setStatus("no_access");
        return;
      }

      setNote(noteRow as any);

      const computed = await sha256(buildNotePayload(noteRow as any, txRow.created_at));
      setStatus(computed === txRow.payload_hash ? "valid" : "invalid");
      return;
    }

    setStatus("invalid");
  }, [authLoading, role, sessionUserId, stopPolling, txId]);

  useEffect(() => {
    if (!txId) return;
    run();
    return () => stopPolling();
  }, [run, stopPolling, txId]);

  const requestConsent = useCallback(async () => {
    if (!meta?.patient_id) return;
    await supabase.rpc("request_patient_consent", { _patient_id: meta.patient_id });
    setStatus("consent_pending");

    stopPolling();
    pollRef.current = window.setInterval(async () => {
      const next = await fetchConsentStatus({ patientId: meta.patient_id, doctorId: sessionUserId ?? "" });
      if (next === "granted") {
        stopPolling();
        run();
      }
    }, 4000);
  }, [meta?.patient_id, run, sessionUserId, stopPolling]);

  const canShowReport = useMemo(() => status === "valid" || status === "invalid", [status]);

  return {
    tx,
    pred,
    note,
    meta,
    status,
    canShowReport,
    patientLabel,
    refresh: run,
    requestConsent,
  };
}
