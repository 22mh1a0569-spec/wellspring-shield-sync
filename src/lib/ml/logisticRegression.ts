export type LogisticRegressionModel = {
  featureNames: string[];
  means: number[];
  stds: number[];
  weights: number[];
  bias: number;
};

function sigmoid(z: number) {
  // numeric stability
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

function meanStd(X: number[][]) {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const means = Array(d).fill(0);
  const stds = Array(d).fill(0);

  for (const row of X) for (let j = 0; j < d; j++) means[j] += row[j];
  for (let j = 0; j < d; j++) means[j] /= Math.max(1, n);

  for (const row of X) for (let j = 0; j < d; j++) stds[j] += (row[j] - means[j]) ** 2;
  for (let j = 0; j < d; j++) {
    stds[j] = Math.sqrt(stds[j] / Math.max(1, n));
    if (!Number.isFinite(stds[j]) || stds[j] === 0) stds[j] = 1;
  }
  return { means, stds };
}

function standardizeRow(x: number[], means: number[], stds: number[]) {
  return x.map((v, j) => (v - means[j]) / stds[j]);
}

export function inferLogisticRegression(model: LogisticRegressionModel, x: number[]): number {
  const z = dot(model.weights, standardizeRow(x, model.means, model.stds)) + model.bias;
  return sigmoid(z);
}

export function trainLogisticRegression(
  X: number[][],
  y: number[],
  opts?: { epochs?: number; learningRate?: number; l2?: number; featureNames?: string[] },
): LogisticRegressionModel {
  const epochs = opts?.epochs ?? 400;
  const lr = opts?.learningRate ?? 0.1;
  const l2 = opts?.l2 ?? 0;
  const featureNames = opts?.featureNames ?? Array.from({ length: X[0]?.length ?? 0 }, (_, i) => `f${i}`);

  const { means, stds } = meanStd(X);
  const Xs = X.map((row) => standardizeRow(row, means, stds));

  const d = Xs[0]?.length ?? 0;
  let w = Array(d).fill(0);
  let b = 0;

  const n = Xs.length;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = Array(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      const p = sigmoid(dot(w, Xs[i]) + b);
      const err = p - y[i];
      for (let j = 0; j < d; j++) gradW[j] += err * Xs[i][j];
      gradB += err;
    }

    for (let j = 0; j < d; j++) {
      const reg = l2 ? l2 * w[j] : 0;
      w[j] -= lr * (gradW[j] / n + reg);
    }
    b -= lr * (gradB / n);
  }

  return { featureNames, means, stds, weights: w, bias: b };
}

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
