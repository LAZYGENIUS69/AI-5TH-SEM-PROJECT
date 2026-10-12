// Extended Kalman filter over a 3-layer soil moisture profile (10/20/30 cm probes).
// State x = [θ10, θ20, θ30] in volumetric %, process model = layered bucket with
// gravity drainage above field capacity. Pure module — no React.

export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];

/** Layer thicknesses (mm) represented by each probe: 0–15, 15–25, 25–40 cm. */
export const LAYER_MM: Vec3 = [150, 100, 150];
/** Fraction of transpiration drawn from each layer (40-30-30 rule within the probe profile). */
export const ROOT_UPTAKE: Vec3 = [0.4, 0.3, 0.3];

export const KF_CONFIG = {
  /** Process noise variance per hour, (vol %)². */
  q: [0.04, 0.03, 0.02] as Vec3,
  /** Sensor noise variance, (vol %)² — capacitive probe ±0.7 % (1σ). */
  r: [0.5, 0.5, 0.5] as Vec3,
  /** Innovation gate (σ) above which a reading is rejected. */
  gateSigma: 3,
  /** Readings that do not change for this many hours while the model moves are flagged as stuck. */
  stuckWindow: 6,
  /** Mean normalised innovation magnitude over the drift window that flags a drifting sensor. */
  driftSigma: 1.5,
  driftWindow: 12,
} as const;

export type SensorFault = "spike" | "stuck" | "drift" | null;

export interface KalmanState {
  x: Vec3;
  P: Mat3;
}

export interface ProcessInput {
  /** Net water entering the surface, mm (rain − runoff + irrigation). */
  infiltrationMm: number;
  /** Transpiration, mm. */
  transpirationMm: number;
  /** Soil evaporation (top layer only), mm. */
  evaporationMm: number;
  /** Field capacity, vol %. */
  thetaFC: number;
  /** Wilting point / residual, vol %. */
  thetaWP: number;
  /** Drainage constant, fraction of excess per hour. */
  drainage: number;
  /** Saturation, vol %. */
  thetaSat: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const identity = (): Mat3 => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export function diag(v: Vec3): Mat3 {
  return [[v[0], 0, 0], [0, v[1], 0], [0, 0, v[2]]];
}
function get(m: Mat3, i: number, j: number): number {
  const row = m[i];
  return row ? (row[j] ?? 0) : 0;
}
export function matMul(a: Mat3, b: Mat3): Mat3 {
  const out = identity();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += get(a, i, k) * get(b, k, j);
    (out[i] as Vec3)[j] = s;
  }
  return out;
}
export function transpose(a: Mat3): Mat3 {
  return [[get(a, 0, 0), get(a, 1, 0), get(a, 2, 0)], [get(a, 0, 1), get(a, 1, 1), get(a, 2, 1)], [get(a, 0, 2), get(a, 1, 2), get(a, 2, 2)]];
}
export function matAdd(a: Mat3, b: Mat3): Mat3 {
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => get(a, i, j) + get(b, i, j))) as Mat3;
}
export function invert3(m: Mat3): Mat3 {
  const [a, b, c] = [get(m, 0, 0), get(m, 0, 1), get(m, 0, 2)];
  const [d, e, f] = [get(m, 1, 0), get(m, 1, 1), get(m, 1, 2)];
  const [g, h, i] = [get(m, 2, 0), get(m, 2, 1), get(m, 2, 2)];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return identity();
  const inv = 1 / det;
  return [
    [A * inv, -(b * i - c * h) * inv, (b * f - c * e) * inv],
    [B * inv, (a * i - c * g) * inv, -(a * f - c * d) * inv],
    [C * inv, -(a * h - b * g) * inv, (a * e - b * d) * inv],
  ];
}
function matVec(m: Mat3, v: Vec3): Vec3 {
  return [0, 1, 2].map((i) => get(m, i, 0) * v[0] + get(m, i, 1) * v[1] + get(m, i, 2) * v[2]) as Vec3;
}

/**
 * Nonlinear layered-bucket process model f(x, u). Water enters layer 1, drains downward
 * from any layer above field capacity, and is removed by root uptake and surface evaporation.
 * Returns the new state and the Jacobian F = ∂f/∂x used by the EKF covariance prediction.
 */
export function processModel(x: Vec3, u: ProcessInput): { x: Vec3; F: Mat3; deepDrainageMm: number } {
  const toPct = (mm: number, layer: number) => (mm / (LAYER_MM[layer] ?? 100)) * 100;
  const next: Vec3 = [...x];
  next[0] += toPct(u.infiltrationMm, 0);
  const F = identity();
  let deepDrainageMm = 0;
  for (let layer = 0; layer < 3; layer++) {
    const excess = next[layer as 0] - u.thetaFC;
    if (excess > 0) {
      const flowPct = u.drainage * excess;
      const flowMm = (flowPct / 100) * (LAYER_MM[layer] ?? 100);
      next[layer as 0] -= flowPct;
      (F[layer] as Vec3)[layer] = 1 - u.drainage;
      if (layer < 2) {
        next[(layer + 1) as 1] += toPct(flowMm, layer + 1);
        (F[layer + 1] as Vec3)[layer] = u.drainage * ((LAYER_MM[layer] ?? 100) / (LAYER_MM[layer + 1] ?? 100));
      } else deepDrainageMm += flowMm;
    }
  }
  for (let layer = 0; layer < 3; layer++) {
    const uptake = u.transpirationMm * (ROOT_UPTAKE[layer] ?? 0) + (layer === 0 ? u.evaporationMm : 0);
    next[layer as 0] = clamp(next[layer as 0] - toPct(uptake, layer), u.thetaWP * 0.6, u.thetaSat);
  }
  return { x: next, F, deepDrainageMm };
}

export interface KalmanStepResult {
  state: KalmanState;
  prior: Vec3;
  innovation: Vec3;
  /** Normalised innovation y_i / √S_ii, in σ. */
  normalized: Vec3;
  /** Mahalanobis distance² over accepted sensors. */
  mahalanobis2: number;
  gain: Mat3;
  accepted: [boolean, boolean, boolean];
  faults: [SensorFault, SensorFault, SensorFault];
}

export interface SensorHistory {
  raw: number[][];
  normalized: number[][];
}

/** Classifies a sensor using its innovation and raw history. */
export function classifyFault(index: number, normalizedNow: number, history: SensorHistory, modelMoved: boolean): SensorFault {
  const raw = history.raw.slice(-KF_CONFIG.stuckWindow).map((row) => row[index] ?? 0);
  if (raw.length >= KF_CONFIG.stuckWindow && modelMoved && Math.max(...raw) - Math.min(...raw) < 0.01) return "stuck";
  if (Math.abs(normalizedNow) > KF_CONFIG.gateSigma) return "spike";
  const recent = history.normalized.slice(-KF_CONFIG.driftWindow).map((row) => row[index] ?? 0);
  if (recent.length >= KF_CONFIG.driftWindow) {
    const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
    const sameSign = recent.every((v) => Math.sign(v) === Math.sign(mean));
    if (sameSign && Math.abs(mean) > KF_CONFIG.driftSigma) return "drift";
  }
  return null;
}

/** One EKF predict + gated update cycle. H = I (each probe observes its own layer). */
export function kalmanStep(prev: KalmanState, z: Vec3, u: ProcessInput, history: SensorHistory): KalmanStepResult {
  const { x: prior, F } = processModel(prev.x, u);
  const Pprior = matAdd(matMul(matMul(F, prev.P), transpose(F)), diag(KF_CONFIG.q));
  const innovation = [z[0] - prior[0], z[1] - prior[1], z[2] - prior[2]] as Vec3;
  const S0 = matAdd(Pprior, diag(KF_CONFIG.r));
  const normalized = [0, 1, 2].map((i) => innovation[i as 0] / Math.sqrt(get(S0, i, i))) as Vec3;
  const modelMoved = Math.abs(prior[0] - prev.x[0]) + Math.abs(prior[1] - prev.x[1]) + Math.abs(prior[2] - prev.x[2]) > 0.005;
  const faults = [0, 1, 2].map((i) => classifyFault(i, normalized[i as 0], history, modelMoved)) as [SensorFault, SensorFault, SensorFault];
  const accepted = faults.map((f) => f === null) as [boolean, boolean, boolean];
  // Rejected sensors get effectively infinite measurement noise.
  const R = diag([0, 1, 2].map((i) => (accepted[i] ? (KF_CONFIG.r[i as 0]) : 1e6)) as Vec3);
  const S = matAdd(Pprior, R);
  const Sinv = invert3(S);
  const K = matMul(Pprior, Sinv);
  const correction = matVec(K, innovation);
  const x = [prior[0] + correction[0], prior[1] + correction[1], prior[2] + correction[2]] as Vec3;
  const IK = matAdd(identity(), matMul(diag([-1, -1, -1]), K));
  const P = matMul(IK, Pprior);
  const gated = innovation.map((v, i) => (accepted[i] ? v : 0)) as Vec3;
  const sv = matVec(Sinv, gated);
  const mahalanobis2 = gated[0] * sv[0] + gated[1] * sv[1] + gated[2] * sv[2];
  return { state: { x, P }, prior, innovation, normalized, mahalanobis2, gain: K, accepted, faults };
}

/** Thickness-weighted root-zone moisture over the managed root depth (replaces fixed weights). */
export function rootZoneTheta(x: Vec3, zrM: number): { theta: number; weights: Vec3 } {
  const zrMm = zrM * 1000;
  let top = 0;
  const covered = LAYER_MM.map((mm) => {
    const c = clamp(zrMm - top, 0, mm);
    top += mm;
    return c;
  }) as Vec3;
  const total = covered[0] + covered[1] + covered[2] || 1;
  const weights = covered.map((c) => c / total) as Vec3;
  return { theta: x[0] * weights[0] + x[1] * weights[1] + x[2] * weights[2], weights };
}

export const KALMAN_SPEC = {
  title: "Extended Kalman filter soil-profile observer",
  summary:
    "Three probes are fused by a physical state-space model instead of fixed weights. Each hour the filter predicts the profile from infiltration, drainage and root uptake, then corrects it with sensor readings weighted by the Kalman gain. Innovations beyond 3σ, frozen readings, or persistent one-sided bias are classified as faults and excluded from the update.",
  formulas: [
    "x = [θ10, θ20, θ30]ᵀ   (volumetric %)",
    "Predict:  x̂⁻ = f(x̂, u)        P⁻ = F P Fᵀ + Q,  F = ∂f/∂x",
    "Drainage: qᵢ = k_d · max(0, θᵢ − θFC)  → layer i+1",
    "Innovation: y = z − H x̂⁻,   S = H P⁻ Hᵀ + R,   H = I",
    "Gain:  K = P⁻ Hᵀ S⁻¹",
    "Update: x̂ = x̂⁻ + K y,   P = (I − K H) P⁻",
    "Gate: |yᵢ| / √Sᵢᵢ > 3σ → spike;  Δz ≈ 0 for 6 h while model moves → stuck",
    "Drift: mean(yᵢ/√Sᵢᵢ) over 12 h > 1.5σ with constant sign",
    "θ_root = Σ wᵢ θᵢ,  wᵢ = layer thickness inside Zr / Zr",
  ],
  config: {
    q: KF_CONFIG.q.join(" / "),
    r: KF_CONFIG.r.join(" / "),
    gateSigma: KF_CONFIG.gateSigma,
    stuckWindowH: KF_CONFIG.stuckWindow,
    driftWindowH: KF_CONFIG.driftWindow,
    driftSigma: KF_CONFIG.driftSigma,
    layersMm: LAYER_MM.join(" / "),
    rootUptake: ROOT_UPTAKE.join(" / "),
  },
} as const;
