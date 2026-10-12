// Closed-loop irrigation engine: simulated field (truth) → noisy probes → EKF observer →
// FAO-56 dual-Kc balance → 72 h MPC → pump. A shadow field runs the reactive threshold rule
// on the same weather so both strategies can be compared honestly. Pure module — no React.

import { dualKcStep, managedRootZone, resolveDssCrop, resolveDssSoil, stageDayFor, type BalanceRow, type DssCrop, type DssSoil } from "./fao56DualKc";
import { KF_CONFIG, kalmanStep, processModel, rootZoneTheta, diag, type KalmanState, type KalmanStepResult, type SensorFault, type SensorHistory, type Vec3 } from "./soilKalman";
import { applicationEfficiency, MPC_DEFAULTS, solveMpc, tariffAt, thresholdBaseline, type HourForecast, type MpcPlan } from "./irrigationMpc";

export interface EngineWeatherHour extends HourForecast {
  temperature: number;
  humidity: number;
  windMs: number;
}

export type FaultInjection = { sensor: 0 | 1 | 2; kind: "stuck" | "spike" | "drift"; remaining: number; value: number };
export type EngineDecision = "IRRIGATE" | "HOLD" | "MANUAL_REVIEW";

export interface LedgerDay {
  day: string;
  et0: number;
  etcAdj: number;
  rain: number;
  runoff: number;
  irrigation: number;
  deepPercolation: number;
  kcb: number;
  ke: number;
  ks: number;
  drEnd: number;
  taw: number;
  raw: number;
  hours: number;
}

export interface StrategyTotals {
  waterMm: number;
  energyCost: number;
  stressMmH: number;
  pumpHours: number;
}

export interface EngineState {
  hourIndex: number;
  dayAfterSowing: number;
  crop: DssCrop;
  soil: DssSoil;
  truth: Vec3;
  shadowTruth: Vec3;
  shadowRunning: boolean;
  de: number;
  z: Vec3;
  kf: KalmanState;
  kfStep: KalmanStepResult | null;
  history: SensorHistory;
  fault: FaultInjection | null;
  heatwaveHours: number;
  stormHours: Record<number, number>;
  tankPct: number;
  pump: boolean;
  decision: EngineDecision;
  reason: string;
  row: BalanceRow | null;
  drEstimate: number;
  drTruth: number;
  thetaRoot: number;
  rootWeights: Vec3;
  plan: MpcPlan | null;
  baselinePlan: MpcPlan | null;
  ledger: LedgerDay[];
  series: { t: string; z10: number; z20: number; z30: number; x10: number; x20: number; x30: number; nis: number; r10: number; r20: number; r30: number; dr: number; raw: number }[];
  mpcTotals: StrategyTotals;
  baselineTotals: StrategyTotals;
  log: string[];
  seed: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function rand(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, seed + 1];
}
function gaussian(seed: number): [number, number] {
  const [a, s1] = rand(seed);
  const [b, s2] = rand(s1);
  return [Math.sqrt(-2 * Math.log(Math.max(1e-9, a))) * Math.cos(2 * Math.PI * b), s2];
}

/** Synthetic diurnal week used only when the live forecast is unavailable. */
export function syntheticWeather(start = new Date()): EngineWeatherHour[] {
  const base = new Date(start);
  base.setMinutes(0, 0, 0);
  return Array.from({ length: 168 }, (_, i) => {
    const d = new Date(base.getTime() + i * 3600_000);
    const hour = d.getHours();
    const sun = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    return { time: d.toISOString().slice(0, 16), hour, et0: 0.02 + 0.55 * sun, rain: 0, rainProb: 5, temperature: 24 + 9 * sun, humidity: 75 - 35 * sun, windMs: 1.5 + sun };
  });
}

export function weatherAt(weather: EngineWeatherHour[], state: Pick<EngineState, "heatwaveHours" | "stormHours">, index: number, offset: number): EngineWeatherHour {
  const w = weather[(index + offset) % weather.length] ?? syntheticWeather()[0];
  const fallback: EngineWeatherHour = { time: "", hour: 0, et0: 0, rain: 0, rainProb: 0, temperature: 25, humidity: 60, windMs: 2 };
  const base = w ?? fallback;
  const heat = offset < state.heatwaveHours ? 1.7 : 1;
  const storm = state.stormHours[index + offset] ?? 0;
  return { ...base, et0: base.et0 * heat, temperature: base.temperature + (heat > 1 ? 6 : 0), rain: base.rain + storm, rainProb: storm > 0 ? 95 : base.rainProb };
}

const pct = (v: number) => v * 100;

export function createEngine(cropId: string, soilId: string, stage: "initial" | "development" | "mid" | "late"): EngineState {
  const crop = resolveDssCrop(cropId);
  const soil = resolveDssSoil(soilId);
  const start = pct(soil.thetaFC - 0.45 * (soil.thetaFC - soil.thetaWP));
  const truth: Vec3 = [start - 0.6, start, start + 0.5];
  const zero: StrategyTotals = { waterMm: 0, energyCost: 0, stressMmH: 0, pumpHours: 0 };
  return {
    hourIndex: 0, dayAfterSowing: stageDayFor(stage, crop), crop, soil, truth, shadowTruth: [...truth], shadowRunning: false, de: 5, z: [...truth],
    kf: { x: [...truth], P: diag([2, 2, 2]) }, kfStep: null, history: { raw: [], normalized: [] }, fault: null, heatwaveHours: 0, stormHours: {},
    tankPct: 90, pump: false, decision: "HOLD", reason: "Starting observer…", row: null, drEstimate: 0, drTruth: 0, thetaRoot: start, rootWeights: [1, 0, 0],
    plan: null, baselinePlan: null, ledger: [], series: [], mpcTotals: { ...zero }, baselineTotals: { ...zero }, log: [], seed: 20261012,
  };
}

function depletionFrom(theta: number, soil: DssSoil, zr: number, taw: number) {
  return clamp(((pct(soil.thetaFC) - theta) / 100) * 1000 * zr, 0, taw);
}

/** Advance the closed loop by one simulated hour. */
export function stepEngine(prev: EngineState, weather: EngineWeatherHour[]): EngineState {
  const s: EngineState = { ...prev, stormHours: { ...prev.stormHours } };
  const { crop, soil } = s;
  const now = weatherAt(weather, s, s.hourIndex, 0);
  const zr = managedRootZone(s.dayAfterSowing, crop);

  // 1 — Observer estimate → depletion estimate.
  const { theta: thetaRoot, weights } = rootZoneTheta(s.kf.x, zr);
  const probeRow = dualKcStep({ et0: now.et0, rain: 0, irrigation: 0, windMs: now.windMs, rhMin: Math.max(20, now.humidity - 20), dayAfterSowing: s.dayAfterSowing, crop, soil, drPrev: 0, dePrev: s.de });
  const taw = probeRow.taw;
  const raw = probeRow.raw;
  const drEstimate = depletionFrom(thetaRoot, soil, zr, taw);

  // 2 — MPC over the next 72 h, plus the reactive baseline on the same inputs.
  const horizon: HourForecast[] = Array.from({ length: MPC_DEFAULTS.horizonH }, (_, k) => weatherAt(weather, s, s.hourIndex, k));
  const kcEff = prev.row ? prev.row.ks * prev.row.kcb + prev.row.ke : probeRow.kcb + probeRow.ke;
  const plan = solveMpc({ forecast: horizon, dr0: drEstimate, taw, raw, kc: kcEff });
  const baselinePlan = thresholdBaseline({ forecast: horizon, dr0: drEstimate, taw, raw, kc: kcEff });

  // 3 — Safety gates.
  const faultsNow = s.kfStep?.faults.filter(Boolean).length ?? 0;
  let decision: EngineDecision;
  let reason: string;
  if (s.tankPct < 10) { decision = "HOLD"; reason = `Tank at ${s.tankPct.toFixed(0)}% — below the 10% safety floor.`; }
  else if (faultsNow >= 2) { decision = "MANUAL_REVIEW"; reason = `${faultsNow} of 3 probes rejected by the observer — estimate not trustworthy.`; }
  else { decision = plan.firstAction ? "IRRIGATE" : "HOLD"; reason = plan.explanation; }
  const pump = decision === "IRRIGATE";

  // 4 — Field physics (truth) with FAO-56 dual-Kc partition.
  const drTruthPrev = depletionFrom(rootZoneTheta(s.truth, zr).theta, soil, zr, taw);
  const eff = applicationEfficiency(now.hour);
  const irrigationNet = pump ? MPC_DEFAULTS.pumpRateMmH * eff : 0;
  const row = dualKcStep({ et0: now.et0, rain: now.rain, irrigation: irrigationNet, windMs: now.windMs, rhMin: Math.max(20, now.humidity - 20), dayAfterSowing: s.dayAfterSowing, crop, soil, drPrev: drTruthPrev, dePrev: s.de });
  const pu = (infiltration: number, ks: number) => ({ infiltrationMm: infiltration, transpirationMm: ks * row.kcb * now.et0, evaporationMm: row.ke * now.et0, thetaFC: pct(soil.thetaFC), thetaWP: pct(soil.thetaWP), drainage: soil.drainagePerHour, thetaSat: pct(soil.thetaFC) + 12 });
  const truthStep = processModel(s.truth, pu(now.rain - row.runoff + irrigationNet, row.ks));
  const truth = truthStep.x;
  const drTruth = depletionFrom(rootZoneTheta(truth, zr).theta, soil, zr, taw);

  // Shadow field under the reactive rule (same weather, same physics).
  const shadowDr = depletionFrom(rootZoneTheta(s.shadowTruth, zr).theta, soil, zr, taw);
  let shadowRunning = s.shadowRunning;
  if (shadowDr > raw) shadowRunning = true; else if (shadowDr < raw * 0.3) shadowRunning = false;
  const shadowKs = shadowDr > raw ? clamp((taw - shadowDr) / ((1 - crop.p) * taw), 0, 1) : 1;
  const shadowNet = shadowRunning && s.tankPct >= 10 ? MPC_DEFAULTS.pumpRateMmH * eff : 0;
  const shadowTruth = processModel(s.shadowTruth, pu(now.rain - row.runoff + shadowNet, shadowKs)).x;
  const shadowDrAfter = depletionFrom(rootZoneTheta(shadowTruth, zr).theta, soil, zr, taw);

  // 5 — Probes: truth + noise + injected faults.
  let seed = s.seed;
  const z = [0, 1, 2].map((i) => { const [g, ns] = gaussian(seed); seed = ns; return truth[i as 0] + g * Math.sqrt(KF_CONFIG.r[i as 0]); }) as Vec3;
  let fault = s.fault ? { ...s.fault } : null;
  if (fault) {
    if (fault.kind === "stuck") z[fault.sensor] = fault.value;
    if (fault.kind === "spike") z[fault.sensor] = truth[fault.sensor] + fault.value;
    if (fault.kind === "drift") { fault.value += 0.35; z[fault.sensor] = truth[fault.sensor] + fault.value; }
    fault.remaining -= 1;
    if (fault.remaining <= 0) fault = null;
  }

  // 6 — EKF update using the same known inputs (rain gauge + metered irrigation).
  const kfStep = kalmanStep(s.kf, z, pu(now.rain - row.runoff + irrigationNet, row.ks), s.history);
  const history: SensorHistory = { raw: [...s.history.raw, [...z]].slice(-24), normalized: [...s.history.normalized, kfStep.accepted.map((a, i) => (a ? kfStep.normalized[i] ?? 0 : 0))].slice(-24) };

  // 7 — Ledger (daily aggregation) and strategy totals.
  const day = now.time.slice(0, 10) || `D${Math.floor(s.hourIndex / 24)}`;
  const ledger = [...s.ledger];
  const last = ledger[ledger.length - 1];
  if (!last || last.day !== day) ledger.push({ day, et0: 0, etcAdj: 0, rain: 0, runoff: 0, irrigation: 0, deepPercolation: 0, kcb: 0, ke: 0, ks: 0, drEnd: 0, taw, raw, hours: 0 });
  const cur = ledger[ledger.length - 1];
  if (cur) {
    const n = cur.hours + 1;
    ledger[ledger.length - 1] = { ...cur, et0: cur.et0 + row.et0, etcAdj: cur.etcAdj + row.etcAdj, rain: cur.rain + now.rain, runoff: cur.runoff + row.runoff, irrigation: cur.irrigation + irrigationNet, deepPercolation: cur.deepPercolation + truthStep.deepDrainageMm, kcb: (cur.kcb * cur.hours + row.kcb) / n, ke: (cur.ke * cur.hours + row.ke) / n, ks: (cur.ks * cur.hours + row.ks) / n, drEnd: drTruth, taw, raw, hours: n };
  }
  const energy = MPC_DEFAULTS.pumpKw * tariffAt(now.hour);
  const mpcTotals = { waterMm: s.mpcTotals.waterMm + (pump ? MPC_DEFAULTS.pumpRateMmH : 0), energyCost: s.mpcTotals.energyCost + (pump ? energy : 0), stressMmH: s.mpcTotals.stressMmH + Math.max(0, drTruth - raw), pumpHours: s.mpcTotals.pumpHours + (pump ? 1 : 0) };
  const shadowPump = shadowNet > 0;
  const baselineTotals = { waterMm: s.baselineTotals.waterMm + (shadowPump ? MPC_DEFAULTS.pumpRateMmH : 0), energyCost: s.baselineTotals.energyCost + (shadowPump ? energy : 0), stressMmH: s.baselineTotals.stressMmH + Math.max(0, shadowDrAfter - raw), pumpHours: s.baselineTotals.pumpHours + (shadowPump ? 1 : 0) };

  const label = now.time.slice(5, 16).replace("T", " ") || `H${s.hourIndex}`;
  const faultTxt = kfStep.faults.map((f, i) => (f ? ` · ${["θ10", "θ20", "θ30"][i]} ${f.toUpperCase()}` : "")).join("");
  const line = `${label} · Dr̂ ${drEstimate.toFixed(1)}/${raw.toFixed(1)} mm · ET₀ ${now.et0.toFixed(2)} · Ks ${row.ks.toFixed(2)} · ${decision}${faultTxt}`;
  const series = [...s.series, { t: label.slice(6), z10: z[0], z20: z[1], z30: z[2], x10: kfStep.state.x[0], x20: kfStep.state.x[1], x30: kfStep.state.x[2], nis: kfStep.mahalanobis2, r10: kfStep.normalized[0], r20: kfStep.normalized[1], r30: kfStep.normalized[2], dr: drTruth, raw }].slice(-72);

  return {
    ...s, hourIndex: s.hourIndex + 1, dayAfterSowing: s.dayAfterSowing + 1 / 24, truth, shadowTruth, shadowRunning, de: row.de, z, kf: kfStep.state, kfStep, history, fault,
    heatwaveHours: Math.max(0, s.heatwaveHours - 1), tankPct: clamp(s.tankPct - 0.15 + (pump ? -1.2 : 0) + (now.hour === 6 ? 25 : 0), 0, 100), pump, decision, reason, row,
    drEstimate, drTruth, thetaRoot, rootWeights: weights, plan, baselinePlan, ledger: ledger.slice(-8), series, mpcTotals, baselineTotals, log: [line, ...s.log].slice(0, 14), seed,
  };
}

export function injectStorm(s: EngineState, mmPerHour = 6, startOffset = 3, hours = 5): EngineState {
  const stormHours = { ...s.stormHours };
  for (let k = 0; k < hours; k++) stormHours[s.hourIndex + startOffset + k] = mmPerHour;
  return { ...s, stormHours };
}
export function injectHeatwave(s: EngineState): EngineState {
  return { ...s, heatwaveHours: 24 };
}
export function injectFault(s: EngineState, kind: SensorFault & string, sensor: 0 | 1 | 2 = 0): EngineState {
  const value = kind === "stuck" ? s.z[sensor] : kind === "spike" ? 14 : 0;
  return { ...s, fault: { sensor, kind, remaining: kind === "spike" ? 1 : kind === "stuck" ? 14 : 30, value } };
}
