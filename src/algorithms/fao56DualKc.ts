// FAO-56 dual crop coefficient (Kcb + Ke) root-zone water balance.
// Reference: Allen, Pereira, Raes & Smith (1998), FAO Irrigation and Drainage Paper 56,
// chapters 7–8 (eqs. 69–88). Pure module — no React.

export type DssCropId = "wheat" | "rice" | "maize";
export type DssSoilId = "sandy_loam" | "loam" | "clay_loam" | "clay";

export interface DssCrop {
  id: DssCropId;
  name: string;
  /** Stage lengths in days: initial, development, mid, late (FAO-56 table 11, typical Indian sowing). */
  stageDays: [number, number, number, number];
  kcbIni: number;
  kcbMid: number;
  kcbEnd: number;
  rootMinM: number;
  rootMaxM: number;
  /** Soil water depletion fraction for no stress (FAO-56 table 22). */
  p: number;
  maxHeightM: number;
}

export interface DssSoil {
  id: DssSoilId;
  name: string;
  /** Volumetric water content, m³/m³ (FAO-56 table 19 mid-range values). */
  thetaFC: number;
  thetaWP: number;
  /** Readily evaporable water, mm. */
  rew: number;
  /** Drainage rate constant above field capacity, fraction per hour (model assumption). */
  drainagePerHour: number;
}

export const DSS_CROPS: Record<DssCropId, DssCrop> = {
  wheat: { id: "wheat", name: "Wheat", stageDays: [20, 50, 60, 30], kcbIni: 0.15, kcbMid: 1.1, kcbEnd: 0.25, rootMinM: 0.1, rootMaxM: 1.2, p: 0.55, maxHeightM: 1.0 },
  maize: { id: "maize", name: "Maize", stageDays: [30, 40, 50, 30], kcbIni: 0.15, kcbMid: 1.15, kcbEnd: 0.5, rootMinM: 0.1, rootMaxM: 1.0, p: 0.55, maxHeightM: 2.0 },
  rice: { id: "rice", name: "Rice", stageDays: [30, 30, 60, 30], kcbIni: 1.0, kcbMid: 1.15, kcbEnd: 0.7, rootMinM: 0.1, rootMaxM: 0.5, p: 0.2, maxHeightM: 1.0 },
};

export const DSS_SOILS: Record<DssSoilId, DssSoil> = {
  sandy_loam: { id: "sandy_loam", name: "Sandy loam", thetaFC: 0.18, thetaWP: 0.08, rew: 8, drainagePerHour: 0.12 },
  loam: { id: "loam", name: "Loam", thetaFC: 0.27, thetaWP: 0.12, rew: 9, drainagePerHour: 0.08 },
  clay_loam: { id: "clay_loam", name: "Clay loam", thetaFC: 0.33, thetaWP: 0.2, rew: 10, drainagePerHour: 0.05 },
  clay: { id: "clay", name: "Clay", thetaFC: 0.4, thetaWP: 0.25, rew: 10, drainagePerHour: 0.03 },
};

/** Surface evaporation layer depth (m), FAO-56 recommends 0.10–0.15. */
export const ZE_M = 0.1;
/** Probe profile depth (m): sensors at 10/20/30 cm represent 0–40 cm. */
export const PROBE_PROFILE_M = 0.4;

export function resolveDssCrop(id: string): DssCrop {
  return id === "rice" || id === "maize" || id === "wheat" ? DSS_CROPS[id] : DSS_CROPS.wheat;
}
export function resolveDssSoil(id: string): DssSoil {
  return id in DSS_SOILS ? DSS_SOILS[id as DssSoilId] : DSS_SOILS.loam;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function stageDayFor(stage: "initial" | "development" | "mid" | "late", crop: DssCrop): number {
  const [a, b, c] = crop.stageDays;
  if (stage === "initial") return Math.round(a / 2);
  if (stage === "development") return Math.round(a + b / 2);
  if (stage === "mid") return Math.round(a + b + c / 2);
  return Math.round(a + b + c + crop.stageDays[3] / 2);
}

/** Kcb(t): piecewise-linear FAO-56 curve (eq. 66). */
export function basalKcb(dayAfterSowing: number, crop: DssCrop): number {
  const [ini, dev, mid, late] = crop.stageDays;
  const d = Math.max(0, dayAfterSowing);
  if (d <= ini) return crop.kcbIni;
  if (d <= ini + dev) return crop.kcbIni + ((d - ini) / dev) * (crop.kcbMid - crop.kcbIni);
  if (d <= ini + dev + mid) return crop.kcbMid;
  const f = clamp((d - ini - dev - mid) / late, 0, 1);
  return crop.kcbMid + f * (crop.kcbEnd - crop.kcbMid);
}

/** Root depth grows linearly from Zr,min to Zr,max over initial + development stages. */
export function rootDepth(dayAfterSowing: number, crop: DssCrop): number {
  const growth = crop.stageDays[0] + crop.stageDays[1];
  return crop.rootMinM + clamp(dayAfterSowing / growth, 0, 1) * (crop.rootMaxM - crop.rootMinM);
}

/** Managed root zone = FAO-56 root depth, limited to what the probes can see. */
export function managedRootZone(dayAfterSowing: number, crop: DssCrop): number {
  return Math.min(rootDepth(dayAfterSowing, crop), PROBE_PROFILE_M);
}

export function plantHeight(dayAfterSowing: number, crop: DssCrop): number {
  const growth = crop.stageDays[0] + crop.stageDays[1];
  return 0.05 + clamp(dayAfterSowing / growth, 0, 1) * (crop.maxHeightM - 0.05);
}

/** TAW = 1000 (θFC − θWP) Zr  (eq. 82). */
export function totalAvailableWater(soil: DssSoil, zrM: number): number {
  return 1000 * (soil.thetaFC - soil.thetaWP) * zrM;
}
/** RAW = p · TAW  (eq. 83). */
export function readilyAvailableWater(taw: number, p: number): number {
  return p * taw;
}
/** TEW = 1000 (θFC − 0.5 θWP) Ze  (eq. 73). */
export function totalEvaporableWater(soil: DssSoil): number {
  return 1000 * (soil.thetaFC - 0.5 * soil.thetaWP) * ZE_M;
}

/** Kc,max (eq. 72). */
export function kcMax(kcb: number, windMs: number, rhMin: number, heightM: number): number {
  const climate = (0.04 * (windMs - 2) - 0.004 * (rhMin - 45)) * Math.pow(heightM / 3, 0.3);
  return Math.max(1.2 + climate, kcb + 0.05);
}

/** Kr (eq. 74): evaporation reduction once the surface layer dries past REW. */
export function evaporationReduction(de: number, tew: number, rew: number): number {
  if (de <= rew) return 1;
  return clamp((tew - de) / (tew - rew), 0, 1);
}

/** fc, fraction of ground covered (eq. 76). */
export function groundCover(kcb: number, kcbMin: number, kcMaxValue: number, heightM: number): number {
  const ratio = clamp((kcb - kcbMin) / Math.max(0.01, kcMaxValue - kcbMin), 0, 0.99);
  return Math.pow(ratio, 1 + 0.5 * heightM);
}

/** Ks (eq. 84): transpiration stress once Dr exceeds RAW. */
export function waterStress(dr: number, taw: number, p: number): number {
  const raw = p * taw;
  if (dr <= raw) return 1;
  return clamp((taw - dr) / ((1 - p) * taw), 0, 1);
}

export interface BalanceInputs {
  et0: number;
  rain: number;
  irrigation: number;
  windMs: number;
  rhMin: number;
  dayAfterSowing: number;
  crop: DssCrop;
  soil: DssSoil;
  /** Root-zone depletion at end of the previous step, mm. */
  drPrev: number;
  /** Surface-layer evaporation depletion at end of previous step, mm. */
  dePrev: number;
  /** Fraction of surface wetted by irrigation (fw). 1 for sprinkler/flood, ~0.35 drip. */
  fw?: number;
}

export interface BalanceRow {
  et0: number;
  kcb: number;
  kcMax: number;
  kr: number;
  ke: number;
  ks: number;
  few: number;
  etc: number;
  etcAdj: number;
  rain: number;
  runoff: number;
  irrigation: number;
  deepPercolation: number;
  zr: number;
  taw: number;
  raw: number;
  tew: number;
  dr: number;
  de: number;
}

/** Simple runoff: rain above the soil's infiltration capacity per step (curve-number free approximation). */
export function runoff(rain: number, soil: DssSoil): number {
  const capacity = soil.id === "clay" ? 15 : soil.id === "clay_loam" ? 20 : soil.id === "loam" ? 30 : 40;
  return Math.max(0, rain - capacity) * 0.6;
}

/** One step of the FAO-56 dual-Kc balance (eq. 85 for Dr, eq. 77 for De). Units mm per step. */
export function dualKcStep(input: BalanceInputs): BalanceRow {
  const { crop, soil } = input;
  const fw = input.fw ?? 1;
  const zr = managedRootZone(input.dayAfterSowing, crop);
  const h = plantHeight(input.dayAfterSowing, crop);
  const taw = totalAvailableWater(soil, zr);
  const raw = readilyAvailableWater(taw, crop.p);
  const tew = totalEvaporableWater(soil);
  const kcb = basalKcb(input.dayAfterSowing, crop);
  const kmax = kcMax(kcb, input.windMs, input.rhMin, h);
  const fc = groundCover(kcb, 0.15, kmax, h);
  const few = clamp(Math.min(1 - fc, fw), 0.01, 1);
  const ro = runoff(input.rain, soil);
  const infiltrated = input.rain - ro + input.irrigation;

  const deStart = Math.max(0, input.dePrev - infiltrated);
  const kr = evaporationReduction(deStart, tew, soil.rew);
  const ke = Math.min(kr * (kmax - kcb), few * kmax);
  const ks = waterStress(input.drPrev, taw, crop.p);
  const etc = (kcb + ke) * input.et0;
  const etcAdj = (ks * kcb + ke) * input.et0;
  const evap = ke * input.et0;
  const de = clamp(deStart + evap / few, 0, tew);

  const drRaw = input.drPrev - infiltrated + etcAdj;
  const deepPercolation = Math.max(0, -drRaw);
  const dr = clamp(drRaw, 0, taw);
  return { et0: input.et0, kcb, kcMax: kmax, kr, ke, ks, few, etc, etcAdj, rain: input.rain, runoff: ro, irrigation: input.irrigation, deepPercolation, zr, taw, raw, tew, dr, de };
}

export const FAO56_SPEC = {
  title: "FAO-56 dual crop coefficient water balance",
  summary:
    "Crop water use is split into basal transpiration (Kcb, stressed by Ks) and soil-surface evaporation (Ke, limited by Kr as the top 10 cm dries). Root-zone depletion Dr is tracked every simulated hour against TAW and RAW.",
  formulas: [
    "ETc,adj = (Ks · Kcb + Ke) · ET₀                     (eq. 80)",
    "Kc,max = max(1.2 + [0.04(u₂−2) − 0.004(RHmin−45)](h/3)^0.3, Kcb+0.05)   (eq. 72)",
    "Ke = min(Kr · (Kc,max − Kcb), few · Kc,max)        (eq. 71)",
    "Kr = (TEW − De) / (TEW − REW)   when De > REW      (eq. 74)",
    "TEW = 1000 (θFC − 0.5 θWP) · Ze                   (eq. 73)",
    "TAW = 1000 (θFC − θWP) · Zr      RAW = p · TAW    (eq. 82–83)",
    "Ks = (TAW − Dr) / ((1 − p) · TAW)  when Dr > RAW   (eq. 84)",
    "Dr,t = Dr,t−1 − (P − RO) − I + ETc,adj + DP       (eq. 85)",
  ],
  assumptions: [
    "Managed root zone is the FAO-56 root depth capped at the 0–40 cm probe profile.",
    "Capillary rise (CR) is taken as zero — no shallow water table modelled.",
    "Runoff is a simple infiltration-capacity excess, not the SCS curve number method.",
    "Soil and crop constants are FAO-56 table values, not measured on a specific field.",
  ],
  constants: { ZeM: ZE_M, probeProfileM: PROBE_PROFILE_M, kcbMinForCover: 0.15 },
} as const;
