/**
 * weatherAdvisor.ts — Evapotranspiration-driven irrigation scheduling and
 * proactive alert decision trees.
 *
 * Reference ET uses the Hargreaves–Samani equation (needs only Tmin/Tmax/Tmean
 * and extraterrestrial radiation), which is the standard fallback where full
 * Penman–Monteith inputs are unavailable.
 */

export type AlertLevel = "info" | "warning" | "critical";

export interface DailyWeather {
  date: string;
  tMax: number;
  tMin: number;
  precipitation: number;
  humidity: number;
  windSpeed: number;
}

export interface CropWaterProfile {
  id: string;
  name: string;
  /** Crop coefficient Kc by stage. */
  kc: { initial: number; development: number; mid: number; late: number };
  /** Allowable depletion fraction of available soil water. */
  depletionFraction: number;
  rootDepthM: number;
}

export interface SoilProfile {
  id: string;
  name: string;
  /** Total available water, mm of water per metre of soil depth. */
  availableWaterMmPerM: number;
  infiltrationMmPerHour: number;
}

export interface IrrigationDay {
  date: string;
  et0: number;
  etc: number;
  effectiveRain: number;
  netDemand: number;
  depletionAfter: number;
  action: "irrigate" | "hold" | "postpone_rain";
  waterMm: number;
  litresPerHa: number;
  reason: string;
}

export interface AgentAlert {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  rule: string;
}

/** Rainfall above this (mm, next 24 h) postpones a scheduled irrigation. */
export const RAIN_POSTPONE_MM = 8;
/** Effective rainfall fraction: share of gross rainfall stored in the root zone. */
export const EFFECTIVE_RAIN_FACTOR = 0.75;
/** Rain above this in a day counts as runoff-heavy; excess is discounted. */
export const RUNOFF_THRESHOLD_MM = 25;
/** Heat-stress and disease-risk trigger points. */
export const ALERT_THRESHOLDS = {
  heatStressC: 38,
  coldStressC: 6,
  fungalHumidity: 88,
  fungalTempMin: 15,
  fungalTempMax: 28,
  windSprayKmh: 20,
  heavyRainMm: 40,
} as const;

export const CROP_WATER_PROFILES: CropWaterProfile[] = [
  { id: "rice", name: "Rice (paddy)", kc: { initial: 1.05, development: 1.1, mid: 1.2, late: 0.9 }, depletionFraction: 0.2, rootDepthM: 0.5 },
  { id: "wheat", name: "Wheat", kc: { initial: 0.4, development: 0.8, mid: 1.15, late: 0.4 }, depletionFraction: 0.55, rootDepthM: 1.2 },
  { id: "maize", name: "Maize", kc: { initial: 0.4, development: 0.8, mid: 1.2, late: 0.6 }, depletionFraction: 0.55, rootDepthM: 1.0 },
  { id: "cotton", name: "Cotton", kc: { initial: 0.35, development: 0.75, mid: 1.15, late: 0.7 }, depletionFraction: 0.65, rootDepthM: 1.2 },
  { id: "tomato", name: "Tomato", kc: { initial: 0.6, development: 0.85, mid: 1.15, late: 0.8 }, depletionFraction: 0.4, rootDepthM: 0.8 },
  { id: "potato", name: "Potato", kc: { initial: 0.5, development: 0.85, mid: 1.15, late: 0.75 }, depletionFraction: 0.35, rootDepthM: 0.5 },
  { id: "sugarcane", name: "Sugarcane", kc: { initial: 0.4, development: 0.9, mid: 1.25, late: 0.75 }, depletionFraction: 0.65, rootDepthM: 1.5 },
  { id: "soybean", name: "Soybean", kc: { initial: 0.4, development: 0.8, mid: 1.15, late: 0.5 }, depletionFraction: 0.5, rootDepthM: 0.8 },
];

export const SOIL_PROFILES: SoilProfile[] = [
  { id: "sandy", name: "Sandy", availableWaterMmPerM: 70, infiltrationMmPerHour: 30 },
  { id: "sandy_loam", name: "Sandy loam", availableWaterMmPerM: 110, infiltrationMmPerHour: 20 },
  { id: "loam", name: "Loam", availableWaterMmPerM: 150, infiltrationMmPerHour: 12 },
  { id: "clay_loam", name: "Clay loam", availableWaterMmPerM: 180, infiltrationMmPerHour: 8 },
  { id: "clay", name: "Clay (black cotton)", availableWaterMmPerM: 200, infiltrationMmPerHour: 4 },
];

export const STAGE_KEYS = ["initial", "development", "mid", "late"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

/** Day-of-year solar declination and extraterrestrial radiation, MJ m⁻² d⁻¹. */
export function extraterrestrialRadiation(latitude: number, date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const doy = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const phi = (Math.PI / 180) * latitude;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const x = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta)));
  const ws = Math.acos(x);
  return (
    ((24 * 60) / Math.PI) *
    0.082 *
    dr *
    (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws))
  );
}

/** Hargreaves–Samani reference evapotranspiration, mm/day. */
export function referenceET(day: DailyWeather, latitude: number): number {
  const tMean = (day.tMax + day.tMin) / 2;
  const ra = extraterrestrialRadiation(latitude, new Date(day.date));
  const et0 = 0.0023 * (tMean + 17.8) * Math.sqrt(Math.max(0, day.tMax - day.tMin)) * ra * 0.408;
  return Math.max(0, et0);
}

export function effectiveRainfall(precipitation: number): number {
  if (precipitation <= 0) return 0;
  const capped = Math.min(precipitation, RUNOFF_THRESHOLD_MM) + Math.max(0, precipitation - RUNOFF_THRESHOLD_MM) * 0.3;
  return capped * EFFECTIVE_RAIN_FACTOR;
}

/** Readily available water in the root zone, mm. */
export function readilyAvailableWater(crop: CropWaterProfile, soil: SoilProfile): number {
  return soil.availableWaterMmPerM * crop.rootDepthM * crop.depletionFraction;
}

/**
 * Water-balance schedule with a rain-delay decision tree.
 * Depletion is tracked day by day; irrigation is triggered when depletion
 * reaches the readily available water (RAW) limit, unless rain is forecast.
 */
export function buildIrrigationSchedule(input: {
  forecast: DailyWeather[];
  latitude: number;
  crop: CropWaterProfile;
  soil: SoilProfile;
  stage: StageKey;
  areaHa: number;
  initialDepletionMm: number;
}): { days: IrrigationDay[]; raw: number; totalWaterMm: number } {
  const raw = readilyAvailableWater(input.crop, input.soil);
  const kc = input.crop.kc[input.stage];
  let depletion = Math.max(0, input.initialDepletionMm);
  let totalWaterMm = 0;

  const days = input.forecast.map((day, i) => {
    const et0 = referenceET(day, input.latitude);
    const etc = et0 * kc;
    const effRain = effectiveRainfall(day.precipitation);
    depletion = Math.max(0, depletion + etc - effRain);

    const tomorrowRain = input.forecast[i + 1]?.precipitation ?? 0;
    let action: IrrigationDay["action"] = "hold";
    let waterMm = 0;
    let reason = "";

    if (depletion < raw * 0.6) {
      action = "hold";
      reason = `Root-zone depletion ${depletion.toFixed(1)} mm is well below the ${raw.toFixed(0)} mm limit — no water needed.`;
    } else if (tomorrowRain >= RAIN_POSTPONE_MM) {
      action = "postpone_rain";
      reason = `${tomorrowRain.toFixed(0)} mm rain forecast tomorrow (≥ ${RAIN_POSTPONE_MM} mm) — postpone irrigation and save the water.`;
    } else if (depletion >= raw) {
      action = "irrigate";
      waterMm = depletion;
      reason = `Depletion ${depletion.toFixed(1)} mm has reached the ${raw.toFixed(0)} mm allowable limit — refill the root zone today.`;
    } else {
      action = "hold";
      reason = `Depletion ${depletion.toFixed(1)} mm is approaching the ${raw.toFixed(0)} mm limit — irrigation likely within 1–2 days.`;
    }

    if (action === "irrigate") {
      depletion = 0;
      totalWaterMm += waterMm;
    }

    return {
      date: day.date,
      et0: Math.round(et0 * 100) / 100,
      etc: Math.round(etc * 100) / 100,
      effectiveRain: Math.round(effRain * 10) / 10,
      netDemand: Math.round((etc - effRain) * 100) / 100,
      depletionAfter: Math.round(depletion * 10) / 10,
      action,
      waterMm: Math.round(waterMm * 10) / 10,
      // 1 mm over 1 ha = 10 000 litres
      litresPerHa: Math.round(waterMm * 10000),
      reason,
    } satisfies IrrigationDay;
  });

  return { days, raw: Math.round(raw * 10) / 10, totalWaterMm: Math.round(totalWaterMm * 10) / 10 };
}

/** Rule-based proactive agent alerts derived from the forecast. */
export function buildAgentAlerts(forecast: DailyWeather[]): AgentAlert[] {
  const alerts: AgentAlert[] = [];
  const today = forecast[0];
  const tomorrow = forecast[1];
  if (!today) return alerts;

  if (tomorrow && tomorrow.precipitation >= RAIN_POSTPONE_MM) {
    alerts.push({
      id: "rain-delay",
      level: "info",
      title: "Postpone irrigation",
      message: `${tomorrow.precipitation.toFixed(0)} mm of rain is expected tomorrow. Hold today's irrigation and re-check in the morning.`,
      rule: `rain(t+1) ≥ ${RAIN_POSTPONE_MM} mm → postpone irrigation`,
    });
  }

  const heavy = forecast.find((d) => d.precipitation >= ALERT_THRESHOLDS.heavyRainMm);
  if (heavy) {
    alerts.push({
      id: "heavy-rain",
      level: "warning",
      title: "Heavy rain — protect applied nutrients",
      message: `${heavy.precipitation.toFixed(0)} mm expected on ${heavy.date}. Do not top-dress urea within 48 hours; clear field drains.`,
      rule: `rain ≥ ${ALERT_THRESHOLDS.heavyRainMm} mm → nutrient leaching risk`,
    });
  }

  const hot = forecast.find((d) => d.tMax >= ALERT_THRESHOLDS.heatStressC);
  if (hot) {
    alerts.push({
      id: "heat",
      level: "critical",
      title: "Heat stress window",
      message: `${hot.tMax.toFixed(0)} °C expected on ${hot.date}. Irrigate at night or early morning and avoid any spraying after 10 am.`,
      rule: `Tmax ≥ ${ALERT_THRESHOLDS.heatStressC} °C → heat stress protocol`,
    });
  }

  const cold = forecast.find((d) => d.tMin <= ALERT_THRESHOLDS.coldStressC);
  if (cold) {
    alerts.push({
      id: "cold",
      level: "warning",
      title: "Cold / frost risk",
      message: `Night temperature near ${cold.tMin.toFixed(0)} °C on ${cold.date}. Light evening irrigation raises canopy temperature and limits frost damage.`,
      rule: `Tmin ≤ ${ALERT_THRESHOLDS.coldStressC} °C → frost protocol`,
    });
  }

  const fungal = forecast.find(
    (d) =>
      d.humidity >= ALERT_THRESHOLDS.fungalHumidity &&
      (d.tMax + d.tMin) / 2 >= ALERT_THRESHOLDS.fungalTempMin &&
      (d.tMax + d.tMin) / 2 <= ALERT_THRESHOLDS.fungalTempMax,
  );
  if (fungal) {
    alerts.push({
      id: "fungal",
      level: "warning",
      title: "High fungal disease pressure",
      message: `Humidity ${fungal.humidity.toFixed(0)}% with mild temperatures on ${fungal.date} — ideal for blight and mildew. Scout the lower canopy and consider a protectant spray.`,
      rule: `RH ≥ ${ALERT_THRESHOLDS.fungalHumidity}% ∧ 15 °C ≤ Tmean ≤ 28 °C → fungal risk`,
    });
  }

  const windy = forecast.slice(0, 3).find((d) => d.windSpeed >= ALERT_THRESHOLDS.windSprayKmh);
  if (windy) {
    alerts.push({
      id: "wind",
      level: "info",
      title: "Poor spraying window",
      message: `Wind near ${windy.windSpeed.toFixed(0)} km/h on ${windy.date} will cause spray drift. Move any planned spray to a calmer day.`,
      rule: `wind ≥ ${ALERT_THRESHOLDS.windSprayKmh} km/h → no spraying`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "clear",
      level: "info",
      title: "No weather risks detected",
      message: "The next 7 days look stable. Continue your normal irrigation and scouting routine.",
      rule: "no rule fired",
    });
  }

  return alerts;
}

export const WEATHER_SPEC = {
  title: "Weather-aware irrigation & alert engine",
  summary:
    "Hargreaves–Samani reference ET scaled by stage crop coefficient, run through a daily root-zone water balance with an effective-rainfall model and a rain-delay decision tree.",
  formulas: [
    {
      label: "Reference evapotranspiration (Hargreaves–Samani)",
      latex: "ET_0=0.0023\\,(T_{mean}+17.8)\\,\\sqrt{T_{max}-T_{min}}\\,R_a\\cdot 0.408",
      symbols: [
        { symbol: "T_mean, T_max, T_min", meaning: "Daily mean / max / min temperature", value: "°C" },
        { symbol: "R_a", meaning: "Extraterrestrial radiation", value: "MJ m⁻² d⁻¹" },
        { symbol: "0.408", meaning: "MJ m⁻² d⁻¹ → mm/d conversion" },
      ],
    },
    {
      label: "Extraterrestrial radiation",
      latex: "R_a=\\tfrac{24\\cdot 60}{\\pi}\\,G_{sc}\\,d_r\\,(\\omega_s\\sin\\varphi\\sin\\delta+\\cos\\varphi\\cos\\delta\\sin\\omega_s)",
      symbols: [
        { symbol: "G_sc", meaning: "Solar constant", value: "0.082 MJ m⁻² min⁻¹" },
        { symbol: "φ, δ, ω_s", meaning: "Latitude, solar declination, sunset hour angle" },
        { symbol: "d_r", meaning: "Inverse relative Earth–Sun distance" },
      ],
    },
    {
      label: "Crop evapotranspiration",
      latex: "ET_c=K_c(\\mathrm{stage})\\cdot ET_0",
      symbols: [
        { symbol: "K_c", meaning: "Crop coefficient for the growth stage", value: "per crop, 0.35–1.25" },
      ],
    },
    {
      label: "Effective rainfall",
      latex: `P_{eff}=${EFFECTIVE_RAIN_FACTOR}\\,\\big(\\min(P,\\,${RUNOFF_THRESHOLD_MM})+0.30\\,\\max(0,\\,P-${RUNOFF_THRESHOLD_MM})\\big)`,
      symbols: [
        { symbol: "P", meaning: "Forecast rainfall", value: "mm" },
        { symbol: String(RUNOFF_THRESHOLD_MM), meaning: "Runoff threshold — excess is discounted to 30%", value: "mm" },
        { symbol: String(EFFECTIVE_RAIN_FACTOR), meaning: "Share of rain stored in the root zone" },
      ],
    },
    {
      label: "Readily available water",
      latex: "RAW=AWC\\,[\\mathrm{mm/m}]\\cdot z_r\\,[\\mathrm{m}]\\cdot p",
      symbols: [
        { symbol: "AWC", meaning: "Soil available water capacity", value: "70–200 mm/m" },
        { symbol: "z_r", meaning: "Crop root depth", value: "0.5–1.5 m" },
        { symbol: "p", meaning: "Allowable depletion fraction", value: "0.2–0.65" },
      ],
    },
    {
      label: "Root-zone depletion (daily water balance)",
      latex: "D_t=\\max\\!\\big(0,\\;D_{t-1}+ET_{c,t}-P_{eff,t}\\big)",
      symbols: [
        { symbol: "D_t", meaning: "Depletion after day t", value: "mm" },
      ],
    },
    {
      label: "Irrigation depth",
      latex: "I_t=D_t\\quad\\text{when }D_t\\ge RAW;\\qquad 1\\ \\mathrm{mm\\cdot ha}=10\\,000\\ \\mathrm{L}",
      symbols: [
        { symbol: "I_t", meaning: "Water applied on day t", value: "mm" },
      ],
    },
  ],
  decisionTree: [
    `if D < 0.6·RAW → hold`,
    `else if rain(t+1) ≥ ${RAIN_POSTPONE_MM} mm → postpone (rain delay)`,
    "else if D ≥ RAW → irrigate to field capacity",
    "else → hold, irrigation due in 1–2 days",
  ],
  thresholds: {
    rainPostponeMm: RAIN_POSTPONE_MM,
    effectiveRainFactor: EFFECTIVE_RAIN_FACTOR,
    runoffThresholdMm: RUNOFF_THRESHOLD_MM,
    ...ALERT_THRESHOLDS,
  },
} as const;
