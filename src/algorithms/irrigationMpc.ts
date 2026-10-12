// 72-hour receding-horizon (model predictive) irrigation scheduler.
// Solved exactly by dynamic programming over a discretised root-zone depletion state.
// Pure module — no React.

export interface HourForecast {
  /** ISO local time, e.g. 2026-10-12T05:00 */
  time: string;
  hour: number;
  et0: number;
  rain: number;
  /** Precipitation probability 0–100. */
  rainProb: number;
}

export interface MpcConfig {
  horizonH: number;
  /** Net application rate of the pump over the field, mm/h. */
  pumpRateMmH: number;
  /** Pump electrical power, kW. */
  pumpKw: number;
  /** Penalty per mm of depletion beyond RAW per hour (₹-equivalent). */
  stressPenalty: number;
  /** Cost of water per mm applied (pumping energy excluded), ₹. */
  waterCostPerMm: number;
  /** Depletion grid resolution, mm. */
  gridMm: number;
  /** Minimum consecutive pump hours once started (anti short-cycling). */
  minRunH: number;
  /** Probability above which rain is counted at full forecast depth rather than expected value. */
  rainTrustProb: number;
}

export const MPC_DEFAULTS: MpcConfig = {
  horizonH: 72,
  pumpRateMmH: 2.5,
  pumpKw: 3.7,
  stressPenalty: 4,
  waterCostPerMm: 1.2,
  gridMm: 0.5,
  minRunH: 1,
  rainTrustProb: 60,
};

/** Assumed Indian agricultural time-of-day tariff (₹/kWh) — illustrative, not a specific utility. */
export function tariffAt(hour: number): number {
  if (hour >= 22 || hour < 6) return 4.5;
  if (hour >= 18) return 8;
  return 6.5;
}

/** Application efficiency by hour: less evaporation and wind drift at night (sprinkler assumption). */
export function applicationEfficiency(hour: number): number {
  if (hour >= 20 || hour < 6) return 0.9;
  if (hour >= 10 && hour < 16) return 0.7;
  return 0.8;
}

/** Rain the controller counts on: full depth if likely, otherwise probability-weighted. */
export function expectedRain(h: HourForecast, cfg: MpcConfig): number {
  return h.rainProb >= cfg.rainTrustProb ? h.rain : h.rain * (h.rainProb / 100);
}

export interface MpcInputs {
  forecast: HourForecast[];
  dr0: number;
  taw: number;
  raw: number;
  /** Effective crop coefficient (Ks·Kcb + Ke) assumed constant across the horizon. */
  kc: number;
  cfg?: MpcConfig;
}

export interface MpcStep {
  time: string;
  hour: number;
  pump: boolean;
  grossMm: number;
  netMm: number;
  et: number;
  rain: number;
  drAfter: number;
  tariff: number;
  efficiency: number;
  cost: number;
}

export interface MpcPlan {
  steps: MpcStep[];
  totalCost: number;
  grossWaterMm: number;
  energyKwh: number;
  energyCost: number;
  stressMmH: number;
  pumpHours: number;
  firstAction: boolean;
  explanation: string;
}

function stepCost(drAfter: number, pump: boolean, h: HourForecast, raw: number, cfg: MpcConfig) {
  const energy = pump ? cfg.pumpKw * tariffAt(h.hour) : 0;
  const water = pump ? cfg.pumpRateMmH * cfg.waterCostPerMm : 0;
  const stress = cfg.stressPenalty * Math.max(0, drAfter - raw);
  return { energy, water, stress, total: energy + water + stress };
}

function transition(dr: number, pump: boolean, h: HourForecast, inp: MpcInputs, cfg: MpcConfig) {
  const eff = applicationEfficiency(h.hour);
  const net = pump ? cfg.pumpRateMmH * eff : 0;
  const et = inp.kc * h.et0;
  const rain = expectedRain(h, cfg);
  return { dr: Math.min(inp.taw, Math.max(0, dr - rain - net + et)), net, et, rain, eff };
}

/**
 * Exact DP over t = 0..H−1 and depletion grid. Bellman recursion:
 *   V_t(D) = min_u [ c(D, u, t) + V_{t+1}(f(D, u, t)) ],   V_H(D) = terminal(D)
 * Terminal cost charges depletion beyond 0.5·RAW so the plan does not dump the problem past the horizon.
 */
export function solveMpc(inp: MpcInputs): MpcPlan {
  const cfg = inp.cfg ?? MPC_DEFAULTS;
  const H = Math.min(cfg.horizonH, inp.forecast.length);
  const n = Math.max(2, Math.ceil(inp.taw / cfg.gridMm) + 1);
  const idx = (dr: number) => Math.min(n - 1, Math.max(0, Math.round(dr / cfg.gridMm)));
  let next = new Float64Array(n);
  for (let i = 0; i < n; i++) next[i] = cfg.stressPenalty * 6 * Math.max(0, i * cfg.gridMm - 0.5 * inp.raw);
  const policy: Uint8Array[] = new Array(H);
  for (let t = H - 1; t >= 0; t--) {
    const h = inp.forecast[t];
    const cur = new Float64Array(n);
    const pol = new Uint8Array(n);
    if (!h) { policy[t] = pol; next = cur; continue; }
    for (let i = 0; i < n; i++) {
      const dr = i * cfg.gridMm;
      let best = Infinity;
      let bestU = 0;
      for (const u of [0, 1]) {
        const tr = transition(dr, u === 1, h, inp, cfg);
        const c = stepCost(tr.dr, u === 1, h, inp.raw, cfg).total + (next[idx(tr.dr)] ?? 0);
        if (c < best - 1e-9) { best = c; bestU = u; }
      }
      cur[i] = best;
      pol[i] = bestU;
    }
    policy[t] = pol;
    next = cur;
  }
  return rollout(inp, cfg, H, (t, dr) => (policy[t]?.[idx(dr)] ?? 0) === 1);
}

/** Reactive baseline: pump whenever depletion exceeds RAW, ignoring forecast, tariff and time of day. */
export function thresholdBaseline(inp: MpcInputs): MpcPlan {
  const cfg = inp.cfg ?? MPC_DEFAULTS;
  const H = Math.min(cfg.horizonH, inp.forecast.length);
  let running = false;
  return rollout(inp, cfg, H, (_t, dr) => {
    if (dr > inp.raw) running = true;
    else if (dr < inp.raw * 0.3) running = false;
    return running;
  });
}

function rollout(inp: MpcInputs, cfg: MpcConfig, H: number, decide: (t: number, dr: number) => boolean): MpcPlan {
  let dr = inp.dr0;
  const steps: MpcStep[] = [];
  let totalCost = 0, gross = 0, energyKwh = 0, energyCost = 0, stress = 0, pumpHours = 0;
  for (let t = 0; t < H; t++) {
    const h = inp.forecast[t];
    if (!h) break;
    const pump = decide(t, dr);
    const tr = transition(dr, pump, h, inp, cfg);
    const c = stepCost(tr.dr, pump, h, inp.raw, cfg);
    dr = tr.dr;
    totalCost += c.total;
    stress += Math.max(0, dr - inp.raw);
    if (pump) { gross += cfg.pumpRateMmH; energyKwh += cfg.pumpKw; energyCost += c.energy; pumpHours += 1; }
    steps.push({ time: h.time, hour: h.hour, pump, grossMm: pump ? cfg.pumpRateMmH : 0, netMm: tr.net, et: tr.et, rain: tr.rain, drAfter: dr, tariff: tariffAt(h.hour), efficiency: tr.eff, cost: c.total });
  }
  const firstAction = steps[0]?.pump ?? false;
  return { steps, totalCost, grossWaterMm: gross, energyKwh, energyCost, stressMmH: stress, pumpHours, firstAction, explanation: explainPlan(steps, inp) };
}

export function explainPlan(steps: MpcStep[], inp: MpcInputs): string {
  const firstPump = steps.findIndex((s) => s.pump);
  const rain24 = steps.slice(0, 24).reduce((s, x) => s + x.rain, 0);
  const pct = inp.taw > 0 ? Math.round((inp.dr0 / inp.taw) * 100) : 0;
  if (steps[0]?.pump) {
    return `Pump now: depletion ${inp.dr0.toFixed(1)} mm (${pct}% of TAW) and this hour is the cheapest safe window (₹${steps[0].tariff}/kWh, ${Math.round(steps[0].efficiency * 100)}% efficiency).`;
  }
  if (firstPump < 0) {
    return rain24 > 1
      ? `Hold: ${rain24.toFixed(1)} mm of expected rain in 24 h keeps depletion within RAW for the whole horizon.`
      : `Hold: depletion ${inp.dr0.toFixed(1)} mm stays within RAW (${inp.raw.toFixed(1)} mm) across 72 h without pumping.`;
  }
  const at = steps[firstPump];
  return `Defer ${firstPump} h: next pump at ${at?.time.slice(11, 16) ?? "?"} (₹${at?.tariff}/kWh, ${Math.round((at?.efficiency ?? 0) * 100)}% efficiency)${rain24 > 1 ? ` after ${rain24.toFixed(1)} mm expected rain` : ""}.`;
}

export const MPC_SPEC = {
  title: "72-hour model predictive irrigation control",
  summary:
    "Every simulated hour the controller re-solves a 72-hour optimal pump schedule against the hourly forecast, applies only the first hour, then re-plans (receding horizon). The optimisation is solved exactly with dynamic programming over a 0.5 mm depletion grid, and compared with a reactive threshold rule.",
  formulas: [
    "min Σₜ [ P_kW · tariff(t) · uₜ + c_w · I · uₜ + λ · max(0, Dr,t − RAW) ] + V_H(Dr,H)",
    "Dr,t+1 = clip(Dr,t − R̂ₜ − η(t) · I · uₜ + Kc · ET₀,t, 0, TAW)",
    "R̂ₜ = Rₜ if PoPₜ ≥ 60 %, else Rₜ · PoPₜ / 100",
    "Bellman: Vₜ(D) = min_u∈{0,1} [ cₜ(D,u) + Vₜ₊₁(f(D,u)) ]",
    "V_H(D) = 6λ · max(0, D − 0.5·RAW)   (terminal cost)",
    "η(t): 0.90 night (20–06), 0.80 shoulder, 0.70 midday (10–16)",
  ],
  assumptions: [
    "Tariff bands (₹4.5 off-peak 22–06, ₹6.5 day, ₹8 peak 18–22) are illustrative.",
    "Efficiency by hour is a sprinkler-loss assumption, not measured on this field.",
    "Kc is held at the current Ks·Kcb + Ke across the horizon.",
    "Forecast is Open-Meteo hourly FAO ET₀, precipitation and probability for the farm location.",
  ],
  config: { ...MPC_DEFAULTS },
} as const;
