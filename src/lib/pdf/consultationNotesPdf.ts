import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export type ConsultationNotesPdfPayload = {
  appointment_id: string;
  note_id: string;
  patient_id: string;
  doctor_id: string;
  diagnosis: string;
  recommendations: string;
  finalized_at: string;
};

export async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function qrPngDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

async function addVerificationBlock(doc: jsPDF, opts: { txId: string; createdAtIso: string; startY: number }) {
  const { txId, createdAtIso, startY } = opts;
  const verifyUrl = `${window.location.origin}/verify/${txId}`;
  const qr = await qrPngDataUrl(verifyUrl);

  const pageH = doc.internal.pageSize.getHeight();
  const bottomY = pageH - 11;

  const requiredH = 70;
  let y = startY;
  if (y + requiredH > bottomY - 10) {
    doc.addPage();
    y = 18;
  }

  const leftX = 14;
  const qrX = 155;
  const qrY = y + 6;
  const qrSize = 40;
  const textWidth = 128;

  doc.setFontSize(12);
  doc.text("Verification (integrity proof)", leftX, y);

  doc.setFontSize(10);
  const explanation =
    "What is verified: this PDF links to a ledger transaction that anchors a SHA-256 hash of the finalized consultation notes (diagnosis + recommendations + timestamps).";
  const explanationLines = doc.splitTextToSize(explanation, textWidth);
  doc.text(explanationLines, leftX, y + 8);

  const lineH = 5.5;
  const metaY = y + 8 + explanationLines.length * lineH + 8;

  doc.text(`Transaction ID: ${txId}`, leftX, metaY);
  doc.text(`Finalized: ${new Date(createdAtIso).toLocaleString()}`, leftX, metaY + 6);

  const verifyLines = doc.splitTextToSize(`Verify URL: ${verifyUrl}`, textWidth);
  doc.text(verifyLines, leftX, metaY + 12);

  doc.addImage(qr, "PNG", qrX, qrY, qrSize, qrSize);
  doc.setFontSize(8);
  doc.text("Scan to verify", qrX + 8, qrY + qrSize + 8);

  const privacy =
    "Privacy: Scanning opens a secure verification page. Full details require sign-in and patient consent. Do not share this PDF publicly.";
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(privacy, 180), leftX, bottomY);
}

export async function downloadConsultationNotesPdf(opts: {
  patientLabel: string;
  payload: ConsultationNotesPdfPayload;
  txId?: string | null;
}) {
  const { patientLabel, payload, txId } = opts;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("Consultation Notes", 14, 18);

  doc.setFontSize(11);
  doc.text(`Patient: ${patientLabel}`, 14, 30);
  doc.text(`Finalized: ${new Date(payload.finalized_at).toLocaleString()}`, 14, 38);
  doc.text(`Appointment: ${payload.appointment_id.slice(0, 8)}…`, 14, 46);

  let y = 62;
  doc.setFontSize(12);
  doc.text("Diagnosis", 14, y);
  doc.setFontSize(10);
  const dxLines = doc.splitTextToSize(payload.diagnosis || "—", 180);
  doc.text(dxLines, 14, y + 8);

  y = y + 8 + dxLines.length * 5.5 + 10;

  doc.setFontSize(12);
  doc.text("Recommendations", 14, y);
  doc.setFontSize(10);
  const recLines = doc.splitTextToSize(payload.recommendations || "—", 180);
  doc.text(recLines, 14, y + 8);

  y = y + 8 + recLines.length * 5.5 + 10;

  if (txId) {
    await addVerificationBlock(doc, { txId, createdAtIso: payload.finalized_at, startY: y });
  } else {
    const privacy =
      "Privacy: This document may contain sensitive medical information. Share only with trusted healthcare providers.";
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(privacy, 180), 14, doc.internal.pageSize.getHeight() - 11);
  }

  doc.save(`consultation-notes-${new Date(payload.finalized_at).toISOString().slice(0, 10)}.pdf`);
}
