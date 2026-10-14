import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ExternalLink, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  CONFUSION_MATRIX_URL,
  isModelMetrics,
  METRICS_URL,
  NOTEBOOK_URL,
  parseLabel,
  type ModelMetrics,
} from "@/algorithms/cnnClassifier";

type SortKey = "name" | "precision" | "recall" | "f1-score" | "support";

export function ModelEvaluation() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [hasMatrix, setHasMatrix] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "f1-score", desc: false });

  useEffect(() => {
    let alive = true;
    fetch(METRICS_URL)
      .then(async (r) => {
        const ct = r.headers.get("content-type") ?? "";
        if (!r.ok || ct.includes("text/html")) throw new Error("missing");
        const json: unknown = await r.json();
        if (!isModelMetrics(json)) throw new Error("bad");
        if (alive) {
          setMetrics(json);
          setState("ready");
        }
      })
      .catch(() => alive && setState("missing"));
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (!metrics) return [];
    const list = Object.entries(metrics.per_class)
      .filter(([k]) => !["accuracy", "macro avg", "weighted avg"].includes(k))
      .map(([name, m]) => ({ name, ...m }));
    const { key, desc } = sort;
    list.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const c = typeof av === "string" ? av.localeCompare(String(bv)) : av - (bv as number);
      return desc ? -c : c;
    });
    return list;
  }, [metrics, sort]);

  const header = (key: SortKey, label: string) => (
    <th className="px-2 py-1.5 text-left font-medium">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : false }))}
      >
        {label} <ArrowUpDown className="size-3" />
      </button>
    </th>
  );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Model evaluation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            <strong>Dataset &amp; limitations:</strong> trained on PlantVillage (lab-style leaf
            images on plain backgrounds, 38 classes), 80/10/10 split, MobileNetV2 transfer learning.
            Accuracy on real field photos will be lower.
          </p>
        </div>

        {state === "loading" && <p className="text-sm text-muted-foreground">Loading metrics…</p>}
        {state === "missing" && (
          <p className="text-sm text-muted-foreground">Metrics not available yet.</p>
        )}
        {state === "ready" && metrics && (
          <>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Test accuracy</p>
              <p className="font-display text-3xl font-semibold">
                {(metrics.test_accuracy * 100).toFixed(2)}%
              </p>
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    {header("name", "Class")}
                    {header("precision", "Prec.")}
                    {header("recall", "Recall")}
                    {header("f1-score", "F1")}
                    {header("support", "n")}
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {rows.map((r) => {
                    const p = parseLabel(r.name);
                    return (
                      <tr key={r.name} className="border-t border-border">
                        <td className="px-2 py-1 font-sans">
                          {p.crop} · {p.disease}
                        </td>
                        <td className="px-2 py-1">{r.precision.toFixed(3)}</td>
                        <td className="px-2 py-1">{r.recall.toFixed(3)}</td>
                        <td className="px-2 py-1">{r["f1-score"].toFixed(3)}</td>
                        <td className="px-2 py-1">{r.support}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {hasMatrix && state === "ready" && (
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className="block w-full overflow-hidden rounded-lg border border-border">
                <img
                  src={CONFUSION_MATRIX_URL}
                  alt="Confusion matrix on the test split"
                  className="w-full"
                  onError={() => setHasMatrix(false)}
                />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl">
              <DialogTitle>Confusion matrix</DialogTitle>
              <img src={CONFUSION_MATRIX_URL} alt="Confusion matrix enlarged" className="w-full" />
            </DialogContent>
          </Dialog>
        )}

        <Button asChild variant="secondary" className="gap-2">
          <a href={NOTEBOOK_URL} target="_blank" rel="noreferrer">
            Open training notebook in Colab <ExternalLink className="size-3" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
