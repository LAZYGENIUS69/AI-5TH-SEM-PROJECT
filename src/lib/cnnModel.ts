/** Browser-only TF.js loader. Imported dynamically so it never runs during SSR. */
import { INPUT_SIZE, LABELS_URL, MODEL_URL } from "@/algorithms/cnnClassifier";

type TfModule = typeof import("@tensorflow/tfjs");
type AnyModel = { predict: (x: import("@tensorflow/tfjs").Tensor) => unknown };

let cache: Promise<{ tf: TfModule; model: AnyModel; labels: string[] }> | null = null;

export function loadCnn() {
  if (!cache) {
    cache = (async () => {
      const head = await fetch(MODEL_URL, { method: "GET" });
      const ct = head.headers.get("content-type") ?? "";
      if (!head.ok || ct.includes("text/html")) throw new Error(`Model not found at ${MODEL_URL}`);
      const json = (await head.json()) as { format?: string };
      const labelsRes = await fetch(LABELS_URL);
      if (!labelsRes.ok) throw new Error(`Labels not found at ${LABELS_URL}`);
      const labels = (await labelsRes.json()) as string[];
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const model: AnyModel =
        json.format === "graph-model"
          ? await tf.loadGraphModel(MODEL_URL)
          : await tf.loadLayersModel(MODEL_URL);
      return { tf, model, labels };
    })();
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

export async function classifyCanvas(source: HTMLImageElement): Promise<{ scores: number[]; labels: string[] }> {
  const { tf, model, labels } = await loadCnn();
  const canvas = document.createElement("canvas");
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(source, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const scores = tf.tidy(() => {
    const input = tf.browser.fromPixels(canvas, 3).toFloat().expandDims(0);
    const out = model.predict(input) as import("@tensorflow/tfjs").Tensor;
    return Array.from(out.dataSync());
  });
  return { scores, labels };
}
