export type DecisionTreeNode =
  | { kind: "leaf"; prob: number }
  | { kind: "node"; featureIndex: number; threshold: number; left: DecisionTreeNode; right: DecisionTreeNode };

export type DecisionTreeModel = {
  featureNames: string[];
  root: DecisionTreeNode;
};

export function inferDecisionTree(model: DecisionTreeModel, x: number[]): number {
  let node: DecisionTreeNode = model.root;
  while (node.kind === "node") {
    node = x[node.featureIndex] <= node.threshold ? node.left : node.right;
  }
  return clamp01(node.prob);
}

export function trainDecisionTree(
  X: number[][],
  y: number[],
  opts?: { maxDepth?: number; minSamplesSplit?: number; featureNames?: string[] },
): DecisionTreeModel {
  const maxDepth = opts?.maxDepth ?? 3;
  const minSamplesSplit = opts?.minSamplesSplit ?? 10;
  const featureNames = opts?.featureNames ?? Array.from({ length: X[0]?.length ?? 0 }, (_, i) => `f${i}`);

  const indices = Array.from({ length: y.length }, (_, i) => i);
  const root = buildNode(X, y, indices, 0, maxDepth, minSamplesSplit);
  return { featureNames, root };
}

function buildNode(
  X: number[][],
  y: number[],
  idx: number[],
  depth: number,
  maxDepth: number,
  minSamplesSplit: number,
): DecisionTreeNode {
  const n = idx.length;
  const p = n ? idx.reduce((acc, i) => acc + y[i], 0) / n : 0;

  if (depth >= maxDepth || n < minSamplesSplit || p === 0 || p === 1) {
    return { kind: "leaf", prob: p };
  }

  const d = X[0]?.length ?? 0;
  let best: { f: number; t: number; gain: number; left: number[]; right: number[] } | null = null;
  const baseImpurity = giniFromProb(p);

  for (let f = 0; f < d; f++) {
    // Candidate thresholds from sampled values (fast + stable for small dataset)
    const values = idx.map((i) => X[i][f]).sort((a, b) => a - b);
    if (!values.length) continue;
    const cand: number[] = [];
    const step = Math.max(1, Math.floor(values.length / 16));
    for (let k = step; k < values.length; k += step) {
      const t = (values[k - 1] + values[k]) / 2;
      if (Number.isFinite(t)) cand.push(t);
    }

    for (const t of cand) {
      const left: number[] = [];
      const right: number[] = [];
      for (const i of idx) {
        if (X[i][f] <= t) left.push(i);
        else right.push(i);
      }
      if (!left.length || !right.length) continue;
      const lp = left.reduce((acc, i) => acc + y[i], 0) / left.length;
      const rp = right.reduce((acc, i) => acc + y[i], 0) / right.length;
      const impurity = (left.length / n) * giniFromProb(lp) + (right.length / n) * giniFromProb(rp);
      const gain = baseImpurity - impurity;
      if (!best || gain > best.gain) best = { f, t, gain, left, right };
    }
  }

  if (!best || best.gain <= 1e-6) return { kind: "leaf", prob: p };

  return {
    kind: "node",
    featureIndex: best.f,
    threshold: best.t,
    left: buildNode(X, y, best.left, depth + 1, maxDepth, minSamplesSplit),
    right: buildNode(X, y, best.right, depth + 1, maxDepth, minSamplesSplit),
  };
}

function giniFromProb(p: number) {
  return 1 - (p * p + (1 - p) * (1 - p));
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}
