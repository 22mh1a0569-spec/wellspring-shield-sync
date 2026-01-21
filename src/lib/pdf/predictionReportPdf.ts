import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export type PredictionPdfPayload = {
  created_at: string;
  risk_percentage: number;
  risk_category: string;
  health_score: number;
  input: any;
};

async function qrPngDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

async function addVerificationBlock(
  doc: jsPDF,
  opts: { txId: string; createdAtIso?: string; startY: number },
) {
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
    "What is verified: this PDF links to a ledger transaction that anchors a SHA-256 hash of the report payload (inputs + risk + score + timestamp). The verification page recomputes the hash and compares it with the stored value.";
  const explanationLines = doc.splitTextToSize(explanation, textWidth);
  doc.text(explanationLines, leftX, y + 8);

  const lineH = 5.5;
  const metaY = y + 8 + explanationLines.length * lineH + 8;

  doc.text(`Transaction ID: ${txId}`, leftX, metaY);
  if (createdAtIso) {
    doc.text(`Report timestamp: ${new Date(createdAtIso).toLocaleString()}`, leftX, metaY + 6);
  }

  const verifyLines = doc.splitTextToSize(`Verify URL: ${verifyUrl}`, textWidth);
  doc.text(verifyLines, leftX, metaY + 12);

  doc.addImage(qr, "PNG", qrX, qrY, qrSize, qrSize);
  doc.setFontSize(8);
  doc.text("Scan to verify", qrX + 8, qrY + qrSize + 8);

  const privacy =
    "Privacy: Scanning opens a secure verification page. Full report details require sign-in and patient consent. Do not share this PDF publicly.";
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(privacy, 180), leftX, bottomY);
}

export async function downloadPredictionReportPdf(opts: {
  patientLabel: string;
  prediction: PredictionPdfPayload;
  txId?: string | null;
}) {
  const { patientLabel, prediction, txId } = opts;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("Smart Healthcare Report", 14, 18);

  doc.setFontSize(11);
  doc.text(`Patient: ${patientLabel}`, 14, 30);
  doc.text(`Timestamp: ${new Date(prediction.created_at).toLocaleString()}`, 14, 38);
  doc.text(
    `Risk: ${Math.round(prediction.risk_percentage)}% (${prediction.risk_category})`,
    14,
    46,
  );
  doc.text(`Health score: ${prediction.health_score}/100`, 14, 54);

  const input = prediction.input ?? {};
  doc.text("Inputs", 14, 68);
  const lines = [
    `Age: ${input.age_years ?? "—"} years`,
    `Blood pressure: ${input.systolic_bp ?? "—"}/${input.diastolic_bp ?? "—"}`,
    `Heart rate: ${input.heart_rate ?? "—"} bpm`,
    `Glucose: ${input.glucose_mgdl ?? "—"} mg/dL`,
    `Cholesterol: ${input.cholesterol_mgdl ?? "—"} mg/dL`,
    `BMI: ${input.bmi ?? "—"}`,
    `Temperature: ${input.temperature_c ?? "—"} °C`,
    `Physical activity: ${input.physical_activity_level ?? "—"}`,
    `Smoking: ${input.smoking ? "Yes" : "No"}`,
    `Regular alcohol: ${input.regular_alcohol ? "Yes" : "No"}`,
    `Family history: ${input.family_history ? "Yes" : "No"}`,
  ];
  lines.forEach((l, i) => doc.text(l, 14, 76 + i * 7));

  const nextY = 76 + lines.length * 7 + 10;

  if (txId) {
    await addVerificationBlock(doc, { txId, createdAtIso: prediction.created_at, startY: nextY });
  } else {
    const privacy =
      "Privacy: This report may contain sensitive medical information. Share only with trusted healthcare providers.";
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(privacy, 180), 14, doc.internal.pageSize.getHeight() - 11);
  }

  doc.save(`smart-healthcare-report-${new Date(prediction.created_at).toISOString().slice(0, 10)}.pdf`);
}
