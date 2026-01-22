// UCI Cleveland Heart Disease (processed.cleveland.data)
// Source file contains 14 columns: 13 features + target (0..4).
// We convert to a binary task: y = (target > 0).

export type UciClevelandRow = {
  age: number;
  sex: number;
  cp: number;
  trestbps: number;
  chol: number;
  fbs: number;
  restecg: number;
  thalach: number;
  exang: number;
  oldpeak: number;
  slope: number;
  ca: number;
  thal: number;
  num: number;
};

export type BinaryDataset = {
  featureNames: string[];
  X: number[][];
  y: number[];
};

export type Split = {
  train: BinaryDataset;
  test: BinaryDataset;
};

const DATA_URL =
  "https://raw.githubusercontent.com/rasbt/python-machine-learning-book/master/code/datasets/uci/heart-disease/processed.cleveland.data";

const FEATURE_NAMES = [
  "age",
  "sex",
  "cp",
  "trestbps",
  "chol",
  "fbs",
  "restecg",
  "thalach",
  "exang",
  "oldpeak",
  "slope",
  "ca",
  "thal",
] as const;

function parseNumber(v: string): number | null {
  const t = v.trim();
  if (!t || t === "?") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export async function fetchAndParseUciCleveland(): Promise<UciClevelandRow[]> {
  const res = await fetch(DATA_URL, { method: "GET" });
  if (!res.ok) throw new Error(`Could not download dataset (${res.status})`);
  const text = await res.text();

  const rows: UciClevelandRow[] = [];
  const lines = text
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 14) continue;
    const nums = parts.map((p) => parseNumber(p));
    if (nums.some((n) => n == null)) continue;
    const [
      age,
      sex,
      cp,
      trestbps,
      chol,
      fbs,
      restecg,
      thalach,
      exang,
      oldpeak,
      slope,
      ca,
      thal,
      num,
    ] = nums as number[];

    rows.push({
      age,
      sex,
      cp,
      trestbps,
      chol,
      fbs,
      restecg,
      thalach,
      exang,
      oldpeak,
      slope,
      ca,
      thal,
      num,
    });
  }

  if (rows.length < 50) throw new Error("Dataset parsed too few rows (possible network/CORS issue)");
  return rows;
}

export function makeBinaryDataset(rows: UciClevelandRow[]): BinaryDataset {
  const X: number[][] = [];
  const y: number[] = [];

  for (const r of rows) {
    X.push([
      r.age,
      r.sex,
      r.cp,
      r.trestbps,
      r.chol,
      r.fbs,
      r.restecg,
      r.thalach,
      r.exang,
      r.oldpeak,
      r.slope,
      r.ca,
      r.thal,
    ]);
    y.push(r.num > 0 ? 1 : 0);
  }

  return { featureNames: [...FEATURE_NAMES], X, y };
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function splitTrainTest(dataset: BinaryDataset, testRatio = 0.2, seed = 42): Split {
  const n = dataset.y.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  const rnd = mulberry32(seed);

  // Fisher-Yates shuffle
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }

  const testN = Math.max(1, Math.floor(n * testRatio));
  const testIdx = idx.slice(0, testN);
  const trainIdx = idx.slice(testN);

  const pick = (ids: number[]) => ({
    featureNames: dataset.featureNames,
    X: ids.map((i) => dataset.X[i]),
    y: ids.map((i) => dataset.y[i]),
  });

  return { train: pick(trainIdx), test: pick(testIdx) };
}

export function evaluateBinaryClassifier(
  dataset: BinaryDataset,
  predictProba: (x: number[]) => number,
): { accuracy: number; auc: number } {
  const probs: number[] = [];
  const ys: number[] = [];
  let correct = 0;

  for (let i = 0; i < dataset.y.length; i++) {
    const p = clamp01(predictProba(dataset.X[i]));
    const y = dataset.y[i];
    probs.push(p);
    ys.push(y);
    const pred = p >= 0.5 ? 1 : 0;
    if (pred === y) correct++;
  }

  return {
    accuracy: dataset.y.length ? correct / dataset.y.length : 0,
    auc: aucScore(ys, probs),
  };
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}

// Simple AUC via trapezoidal rule over ROC points.
function aucScore(yTrue: number[], yScore: number[]): number {
  const pairs = yTrue.map((y, i) => ({ y, s: yScore[i] }));
  pairs.sort((a, b) => b.s - a.s);

  const P = yTrue.filter((y) => y === 1).length;
  const N = yTrue.length - P;
  if (P === 0 || N === 0) return 0.5;

  let tp = 0;
  let fp = 0;
  let prevTpr = 0;
  let prevFpr = 0;
  let area = 0;

  for (const p of pairs) {
    if (p.y === 1) tp++;
    else fp++;
    const tpr = tp / P;
    const fpr = fp / N;
    area += (fpr - prevFpr) * (tpr + prevTpr) * 0.5;
    prevTpr = tpr;
    prevFpr = fpr;
  }
  return clamp01(area);
}
