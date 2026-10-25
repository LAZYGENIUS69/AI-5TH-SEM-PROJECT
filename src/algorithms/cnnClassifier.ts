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
export const CLASS_COUNT = 38;

/** Both inference and the on-load self-test enforce the exported model contract. */
export function validateCnnOutput(shape: number[], scores: number[]): number {
  if (shape.length !== 2 || shape[0] !== 1 || shape[1] !== CLASS_COUNT || scores.length !== CLASS_COUNT) {
    throw new Error(`CNN output must be [1,${CLASS_COUNT}]; received [${shape.join(",")}] (${scores.length} scores)`);
  }
  if (scores.some((score) => !Number.isFinite(score) || score < 0 || score > 1)) {
    throw new Error("CNN output contains invalid probabilities");
  }
  const sum = scores.reduce((total, score) => total + score, 0);
  if (Math.abs(sum - 1) > 0.001) throw new Error(`CNN probabilities must sum to about 1; received ${sum}`);
  return sum;
}

export function validateCnnLabels(value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== CLASS_COUNT ||
      value.some((label) => typeof label !== "string" || !label.includes("___")) ||
      new Set(value).size !== CLASS_COUNT) {
    throw new Error(`class_names.json must contain ${CLASS_COUNT} unique Crop___Disease labels in model output order`);
  }
  return value as string[];
}

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
  return typeof o["test_accuracy"] === "number" && !!o["per_class"] && typeof o["per_class"] === "object";
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
  formulas: [
    {
      label: "Input rescaling (baked into the model)",
      latex: "x'=\\dfrac{x}{127.5}-1",
      symbols: [
        { symbol: "x", meaning: "Raw pixel value", value: "0–255" },
        { symbol: "x′", meaning: "Scaled input to the backbone", value: "−1…1" },
      ],
    },
    {
      label: "Global average pooling",
      latex: "\\bar f_c=\\dfrac{1}{HW}\\sum_{h,w}f_{c,h,w}",
      symbols: [
        { symbol: "f_{c,h,w}", meaning: "Backbone feature map, channel c" },
        { symbol: "H × W", meaning: "Feature-map spatial size" },
      ],
    },
    {
      label: "Softmax over 38 classes",
      latex: "\\sigma(\\mathbf z)_k=\\dfrac{e^{z_k}}{\\sum_j e^{z_j}}",
      symbols: [
        { symbol: "z_k", meaning: "Logit for class k" },
        { symbol: "σ(z)_k", meaning: "Probability shown as confidence" },
      ],
    },
    {
      label: "Training loss (cross-entropy)",
      latex: "\\mathcal L=-\\sum_k y_k\\log\\hat y_k",
      symbols: [
        { symbol: "y_k", meaning: "One-hot true label" },
        { symbol: "ŷ_k", meaning: "Predicted probability" },
      ],
    },
    {
      label: "Evaluation metrics (from metrics.json)",
      latex: "\\mathrm{Precision}=\\tfrac{TP}{TP+FP},\\quad \\mathrm{Recall}=\\tfrac{TP}{TP+FN},\\quad F_1=\\tfrac{2PR}{P+R}",
      symbols: [
        { symbol: "TP / FP / FN", meaning: "True / false positives, false negatives on the test split" },
      ],
    },
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
