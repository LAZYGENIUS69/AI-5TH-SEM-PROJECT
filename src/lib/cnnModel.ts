/** Browser-only TF.js loader. Imported dynamically so it never runs during SSR. */
import { INPUT_SIZE, LABELS_URL, MODEL_URL, validateCnnLabels, validateCnnOutput } from "@/algorithms/cnnClassifier";

type TfModule = typeof import("@tensorflow/tfjs");
type LoadedCnn = { tf: TfModule; model: import("@tensorflow/tfjs").LayersModel; labels: string[]; loadTimeMs: number };
let cache: Promise<LoadedCnn> | null = null;

function readOutput(tf: TfModule, model: LoadedCnn["model"], input: import("@tensorflow/tfjs").Tensor) {
  const output = model.predict(input);
  if (Array.isArray(output) || !(output instanceof tf.Tensor)) {
    throw new Error("CNN must return one probability tensor");
  }
  const scores = Array.from(output.dataSync());
  const sum = validateCnnOutput(output.shape, scores);
  return { scores, sum, shape: output.shape };
}

export function loadCnn() {
  if (!cache) {
    cache = (async () => {
      const started = performance.now();
      const head = await fetch(MODEL_URL, { method: "GET" });
      const ct = head.headers.get("content-type") ?? "";
      if (!head.ok || ct.includes("text/html")) throw new Error(`Model not found at ${MODEL_URL}`);
      const json = (await head.json()) as { format?: string };
      if (json.format !== "layers-model") throw new Error(`Expected layers-model; received ${json.format ?? "unknown format"}`);
      const labelsRes = await fetch(LABELS_URL);
      if (!labelsRes.ok || (labelsRes.headers.get("content-type") ?? "").includes("text/html")) throw new Error(`Labels not found at ${LABELS_URL}`);
      const labels = validateCnnLabels(await labelsRes.json());
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const model = await tf.loadLayersModel(MODEL_URL);
      try {
        const shape = model.inputs[0]?.shape;
        if (!shape || shape.length !== 4 || (shape[0] !== null && shape[0] !== 1) || shape[1] !== INPUT_SIZE || shape[2] !== INPUT_SIZE || shape[3] !== 3) {
          throw new Error(`CNN input must be [1,224,224,3]; received [${shape?.join(",") ?? "unknown"}]`);
        }
        for (const kind of ["zero", "random-noise"] as const) {
          const report = tf.tidy(() => {
            const input = kind === "zero"
              ? tf.zeros([1, INPUT_SIZE, INPUT_SIZE, 3])
              : tf.randomUniform([1, INPUT_SIZE, INPUT_SIZE, 3], 0, 256, "float32", 42);
            const { sum, shape: outputShape } = readOutput(tf, model, input);
            return { sum, shape: outputShape };
          });
          console.info(`[AgriSense CNN self-test] ${kind}: PASS shape=[${report.shape.join(",")}] sum=${report.sum.toFixed(6)} input=raw float32 0-255 backend=${tf.getBackend()}`);
        }
        return { tf, model, labels, loadTimeMs: Math.round(performance.now() - started) };
      } catch (error) {
        model.dispose();
        throw error;
      }
    })();
    cache.catch((error: unknown) => {
      cache = null;
      console.error(`[AgriSense CNN] Failed: ${error instanceof Error ? error.message : String(error)}`);
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
    return readOutput(tf, model, input).scores;
  });
  return { scores, labels };
}
