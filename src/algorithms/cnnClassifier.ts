/**
 * cnnClassifier.ts — pure helpers for the MobileNetV2 leaf classifier.
 * No TensorFlow or React imports: model loading lives in src/lib/cnnModel.ts.
 */
import { DISEASE_SIGNATURES, type DiseaseSignature } from "@/algorithms/diseaseCV";

/** Where the converted TF.js model lives. Can point to a remote URL later. */
export const MODEL_URL = "/model/model.json";
export const LABELS_URL = "/model/class_names.json";
export const METRICS_URL = "/model/metrics.json";
export const CONFUSION_MATRIX_URL = "/model/confusion_matrix.png";
/** Placeholder until the real training notebook is shared. */
export const NOTEBOOK_URL = "https://colab.research.google.com/";

export const INPUT_SIZE = 224;
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
export const TOP_K = 3;

export interface CnnPrediction {
  label: string;
  crop: string;
  disease: string;
  healthy: boolean;
  confidence: number;
}

export interface ModelMetrics {
  test_accuracy: number;
  per_class: Record<
    string,
    { precision: number; recall: number; "f1-score": number; support: number }
  >;
}

/** "Tomato___Early_blight" -> { crop: "Tomato", disease: "Early blight" } */
export function parseLabel(label: string): { crop: string; disease: string; healthy: boolean } {
  const [rawCrop = label, rawDisease = ""] = label.split("___");
  const clean = (s: string) => s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const crop = clean(rawCrop.replace(/,/g, ""));
  const disease = clean(rawDisease) || "Unknown";
  return { crop, disease, healthy: disease.toLowerCase() === "healthy" };
}

/** Apply softmax only if the model output is not already a probability vector. */
export function toProbabilities(scores: number[]): number[] {
  const sum = scores.reduce((a, b) => a + b, 0);
  const allPositive = scores.every((s) => s >= 0);
  if (allPositive && Math.abs(sum - 1) < 1e-3) return scores;
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const z = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / z);
}

export function topPredictions(scores: number[], labels: string[], k = TOP_K): CnnPrediction[] {
  const probs = toProbabilities(scores);
  return probs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p - a.p)
    .slice(0, k)
    .map(({ p, i }) => {
      const label = labels[i] ?? `class_${i}`;
      return { label, ...parseLabel(label), confidence: p };
    });
}

/** Map a PlantVillage disease to one of the 7 existing remediation cards, if any. */
export function matchRemediation(pred: Pick<CnnPrediction, "disease" | "healthy">): DiseaseSignature | null {
  const d = pred.disease.toLowerCase();
  const find = (id: string) => DISEASE_SIGNATURES.find((s) => s.id === id) ?? null;
  if (pred.healthy) return find("healthy");
  if (d.includes("early blight")) return find("early_blight");
  if (d.includes("late blight")) return find("late_blight");
  if (d.includes("rust")) return find("leaf_rust");
  if (d.includes("powdery mildew")) return find("powdery_mildew");
  if (d.includes("bacterial")) return find("bacterial_leaf_blight");
  return null;
}

export function isModelMetrics(v: unknown): v is ModelMetrics {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.test_accuracy === "number" && !!o.per_class && typeof o.per_class === "object";
}

export const CNN_SPEC = {
  title: "CNN leaf classifier (MobileNetV2 transfer learning)",
  summary:
    "A MobileNetV2 backbone pretrained on ImageNet, fine-tuned on PlantVillage (38 classes), converted to TensorFlow.js and run fully in the browser. Accuracy figures are read from metrics.json at runtime — none are hardcoded here.",
  architecture: [
    "Input 224×224×3, raw 0–255 RGB (rescaling is baked into the model)",
    "MobileNetV2 backbone (ImageNet weights, transfer learning)",
    "GlobalAveragePooling2D",
    "Dropout(0.3)",
    "Dense(38, softmax)",
  ],
  pipeline: [
    "Draw photo to a canvas and resize to 224×224",
    "Read RGB pixels as float32 tensor [1,224,224,3] — no normalisation",
    "Forward pass with TensorFlow.js (WebGL, CPU fallback)",
    "Softmax probabilities -> top-3 classes",
    "Split label on '___' into crop and disease",
    "Top confidence < 60% -> ask for a retake on a plain background",
  ],
  thresholds: {
    inputSize: INPUT_SIZE,
    lowConfidence: LOW_CONFIDENCE_THRESHOLD,
    topK: TOP_K,
  },
  sources: { model: MODEL_URL, labels: LABELS_URL, metrics: METRICS_URL },
  dataset:
    "PlantVillage: lab-style leaf images on plain backgrounds, 38 classes, 80/10/10 split. Accuracy on real field photos will be lower.",
} as const;
