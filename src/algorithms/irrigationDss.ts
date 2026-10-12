export type FaultType = "static" | "spike" | null;
export type DecisionType = "IRRIGATE" | "HOLD" | "MANUAL_REVIEW";
export type ModelType = "KNN" | "NAIVE_BAYES";
export type SensorCropType = "wheat" | "rice" | "maize";

export interface SensorReading {
  depth10: number;
  depth20: number;
  depth30: number;
  temperature: number;
  humidity: number;
}

export interface FaultStatus {
  sensor: "depth10" | "depth20" | "depth30" | null;
  type: FaultType;
}

export interface KNNNeighbor {
  sm: number;
  temp: number;
  rh: number;
  etc: number;
  label: "IRRIGATE" | "HOLD";
  distance: number;
}

export interface KNNResult {
  label: "IRRIGATE" | "HOLD";
  confidence: number;
  neighbors: KNNNeighbor[];
}

export interface BayesResult {
  pIrrigate: number;
  pHold: number;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(42);
export const TRAINING_DATA: KNNNeighbor[] = Array.from({ length: 80 }, () => {
  const sm = 25 + rand() * 65;
  const temp = 24 + rand() * 14;
  const rh = 40 + rand() * 45;
  const etc = 1.1 * (0.0023 * (temp + 17.8) * Math.sqrt(8) * 14);
  let label: "IRRIGATE" | "HOLD" = sm < 50 ? "IRRIGATE" : "HOLD";
  if (rand() < 0.15) label = label === "IRRIGATE" ? "HOLD" : "IRRIGATE";
  return { sm, temp, rh, etc, label, distance: 0 };
});

export const SENSOR_CROP_KC: Record<SensorCropType, number> = {
  wheat: 1.15,
  rice: 1.2,
  maize: 1.05,
};

export function weightedFusion(d10: number, d20: number, d30: number): number {
  return 0.5 * d10 + 0.3 * d20 + 0.2 * d30;
}

export function normalize(fused: number, min = 20, max = 100): number {
  return ((fused - min) / (max - min)) * 100;
}

export function sma(history: number[], n = 6): number {
  const window = history.slice(-n);
  return window.length === 0 ? 0 : window.reduce((a, b) => a + b, 0) / window.length;
}

export function hargreavesET0(temp: number, kc = 1.1): { et0: number; etc: number } {
  const tMax = temp + 4;
  const tMin = temp - 4;
  const ra = 14;
  const et0 = 0.0023 * (temp + 17.8) * Math.sqrt(tMax - tMin) * ra;
  return { et0, etc: kc * et0 };
}

export function detectStatic(history: number[], epsilon = 0.005, minTicks = 6): boolean {
  if (history.length < minTicks) return false;
  const recent = history.slice(-minTicks);
  return recent.every((value, index) => index === 0 || Math.abs(value - (recent[index - 1] ?? value)) < epsilon);
}

export function detectSpike(current: number, average: number, deltaMax = 0.25): boolean {
  return Math.abs(current - average) > deltaMax;
}

export function knn(smNorm: number, temp: number, rh: number, etc: number): KNNResult {
  const n = (value: number, min: number, max: number) => (value - min) / (max - min);
  const qSm = n(smNorm, 0, 100);
  const qT = n(temp, 24, 38);
  const qRh = n(rh, 40, 85);
  const qEtc = n(etc, 0, 10);
  const neighbors = TRAINING_DATA.map((sample) => ({
    ...sample,
    distance: Math.sqrt(
      Math.pow(n(sample.sm, 25, 90) - qSm, 2) +
        Math.pow(n(sample.temp, 24, 38) - qT, 2) +
        Math.pow(n(sample.rh, 40, 85) - qRh, 2) +
        Math.pow(n(sample.etc, 0, 10) - qEtc, 2),
    ),
  }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);
  const irrigateVotes = neighbors.filter((neighbor) => neighbor.label === "IRRIGATE").length;
  return {
    label: irrigateVotes >= 3 ? "IRRIGATE" : "HOLD",
    confidence: Math.max(irrigateVotes, 5 - irrigateVotes) / 5,
    neighbors,
  };
}

export function naiveBayes(smNorm: number): BayesResult {
  const smLow = smNorm < 50;
  const pIrrUnnorm = (smLow ? 0.85 : 0.15) * 0.4;
  const pHoldUnnorm = (smLow ? 0.1 : 0.9) * 0.6;
  const total = pIrrUnnorm + pHoldUnnorm;
  return { pIrrigate: pIrrUnnorm / total, pHold: pHoldUnnorm / total };
}

export const IRRIGATION_DSS_SPEC = {
  title: "Sensor-fusion irrigation decision system",
  summary:
    "Three weighted soil probes are normalized and smoothed before KNN classification. Low-confidence cases expose a Naive Bayes fallback, while rain and tank safety gates override pump activation.",
  formulas: [
    "SMfused = 0.50·SM10 + 0.30·SM20 + 0.20·SM30",
    "SMnorm = ((SMfused − 20) / (100 − 20)) · 100",
    "SMsmooth(t) = (1/6) · Σ SMnorm(t−i)",
    "ET₀ = 0.0023 · (Tmean + 17.8) · √(Tmax − Tmin) · Ra",
    "ETc = Kc · ET₀",
    "d(q,x) = √Σj (normalize(qj) − normalize(xj))²",
    "P(class|evidence) ∝ P(evidence|class) · P(class)",
  ],
  decisionTree: [
    "if rain detected                         → HOLD",
    "else if tank level < 10%                 → HOLD",
    "else if smoothed moisture < 35%          → IRRIGATE",
    "else if KNN confidence ≥ 85%             → KNN majority decision",
    "else                                      → MANUAL REVIEW (Naive Bayes shown)",
  ],
  thresholds: { knnK: 5, confidenceGate: 0.85, moistureOverridePct: 35, fieldCapacityPct: 45, tankMinimumPct: 10, smoothingWindow: 6 },
  weights: { depth10: 0.5, depth20: 0.3, depth30: 0.2 },
} as const;