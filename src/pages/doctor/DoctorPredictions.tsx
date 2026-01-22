import React from "react";
import { nanoid } from "nanoid";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  evaluateBinaryClassifier,
  fetchAndParseUciCleveland,
  makeBinaryDataset,
  splitTrainTest,
} from "@/lib/ml/uciCleveland";
import {
  inferLogisticRegression,
  trainLogisticRegression,
  type LogisticRegressionModel,
} from "@/lib/ml/logisticRegression";
import {
  inferDecisionTree,
  trainDecisionTree,
  type DecisionTreeModel,
} from "@/lib/ml/decisionTree";

type MlModelRow = {
  id: string;
  model_key: string;
  model_type: string;
  is_active: boolean;
  metrics: any;
  created_at: string;
};

export default function DoctorPredictions() {
  const { user } = useAuth();
  const [models, setModels] = React.useState<MlModelRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [training, setTraining] = React.useState(false);
  const [trainLog, setTrainLog] = React.useState<string>("");

  const loadModels = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ml_models")
        .select("id,model_key,model_type,is_active,metrics,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setModels((data ?? []) as any);
    } catch (e: any) {
      toast({ title: "Could not load models", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const activateModel = async (modelKey: string) => {
    try {
      const { error } = await supabase.rpc("set_active_ml_model", { _model_key: modelKey });
      if (error) throw error;
      toast({ title: "Active model updated" });
      await loadModels();
    } catch (e: any) {
      toast({ title: "Could not activate model", description: e?.message ?? "Try again", variant: "destructive" });
    }
  };

  const trainFromUci = async () => {
    if (!user?.id) return;
    setTraining(true);
    setTrainLog("Downloading dataset…");
    try {
      const raw = await fetchAndParseUciCleveland();
      const dataset = makeBinaryDataset(raw);
      const { train, test } = splitTrainTest(dataset, 0.2, 42);

      setTrainLog("Training logistic regression…");
      const lrModel = trainLogisticRegression(train.X, train.y, {
        epochs: 500,
        learningRate: 0.15,
        l2: 0.001,
      });
      const lrEval = evaluateBinaryClassifier(test, (x) => inferLogisticRegression(lrModel, x));

      setTrainLog("Training decision tree…");
      const treeModel = trainDecisionTree(train.X, train.y, {
        maxDepth: 3,
        minSamplesSplit: 18,
      });
      const treeEval = evaluateBinaryClassifier(test, (x) => inferDecisionTree(treeModel, x));

      setTrainLog("Saving models…");
      const baseKey = `uci_cleveland_${new Date().toISOString().slice(0, 10)}_${nanoid(6)}`;

      const lrKey = `${baseKey}_logreg`;
      const treeKey = `${baseKey}_tree`;

      const insertModels = async () => {
        const lrPayload = {
          schema: { source: "UCI Cleveland", task: "heart_disease_binary", features: dataset.featureNames },
          model: lrModel,
        } satisfies { schema: any; model: LogisticRegressionModel };

        const treePayload = {
          schema: { source: "UCI Cleveland", task: "heart_disease_binary", features: dataset.featureNames },
          model: treeModel,
        } satisfies { schema: any; model: DecisionTreeModel };

        const { error: e1 } = await supabase.from("ml_models").insert({
          model_key: lrKey,
          model_type: "logistic_regression",
          params: lrPayload as any,
          metrics: {
            ...lrEval,
            n_train: train.y.length,
            n_test: test.y.length,
            trained_at: new Date().toISOString(),
          },
          trained_by: user.id,
        });
        if (e1) throw e1;

        const { error: e2 } = await supabase.from("ml_models").insert({
          model_key: treeKey,
          model_type: "decision_tree",
          params: treePayload as any,
          metrics: {
            ...treeEval,
            n_train: train.y.length,
            n_test: test.y.length,
            trained_at: new Date().toISOString(),
          },
          trained_by: user.id,
        });
        if (e2) throw e2;
      };

      await insertModels();

      // Activate best-performing model (by test accuracy)
      const bestKey = lrEval.accuracy >= treeEval.accuracy ? lrKey : treeKey;
      await activateModel(bestKey);

      setTrainLog(
        `Done. Logistic Regression acc=${Math.round(lrEval.accuracy * 100)}%, Tree acc=${Math.round(treeEval.accuracy * 100)}%. Activated: ${bestKey}`,
      );
    } catch (e: any) {
      setTrainLog("");
      toast({ title: "Training failed", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setTraining(false);
      await loadModels();
    }
  };

  return (
    <main className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Predictions</h1>
        <p className="text-sm text-muted-foreground">Train and manage the active prediction model.</p>
      </header>

      <div className="grid gap-4">
        <Card className="border bg-card shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="font-display">Model training (UCI Cleveland)</CardTitle>
            <Button variant="hero" className="rounded-xl" disabled={training} onClick={() => void trainFromUci()}>
              {training ? "Training…" : "Train from UCI"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">
              This runs training in your browser, stores artifacts in the backend, then activates the best model.
            </div>
            {trainLog ? <div className="rounded-xl border bg-background p-3 text-sm">{trainLog}</div> : null}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-card">
          <CardHeader>
            <CardTitle className="font-display">Registered models</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border bg-background shadow-soft">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Accuracy</TableHead>
                    <TableHead>Trained</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : models.length ? (
                    models.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{m.model_type}</span>
                            {m.is_active ? <Badge variant="secondary">Active</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.model_key}</TableCell>
                        <TableCell>{typeof m.metrics?.accuracy === "number" ? `${Math.round(m.metrics.accuracy * 100)}%` : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.metrics?.trained_at ? new Date(m.metrics.trained_at).toLocaleString() : new Date(m.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant={m.is_active ? "outline" : "hero"}
                            size="sm"
                            className="rounded-xl"
                            disabled={training || m.is_active}
                            onClick={() => void activateModel(m.model_key)}
                          >
                            {m.is_active ? "Active" : "Set active"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        No models yet. Click “Train from UCI”.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
