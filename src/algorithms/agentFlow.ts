/**
 * agentFlow.ts — one-click farm analysis orchestration. No React imports.
 * Side effects (forecast fetch, LLM stream) are injected so the flow stays testable.
 */
import { buildContextBlock, retrieve, type RetrievedChunk } from "@/algorithms/ragEngine";
import {
  buildAgentAlerts,
  buildIrrigationSchedule,
  CROP_WATER_PROFILES,
  RAIN_POSTPONE_MM,
  SOIL_PROFILES,
  type AgentAlert,
  type DailyWeather,
  type IrrigationDay,
  type StageKey,
} from "@/algorithms/weatherAdvisor";

export const FUNGAL_HUMIDITY_PCT = 80;

export interface AgentScan {
  crop?: string;
  disease: string;
  confidence: number;
  engine?: string;
  severity?: string;
  at: string;
}

export interface AgentFarm {
  placeName: string;
  latitude: number;
  longitude: number;
  cropId: string;
  soilId: string;
  stage: StageKey;
  areaHa: number;
}

export type StepStatus = "pending" | "running" | "done" | "error";
export interface AgentStep {
  id: string;
  label: string;
  status: StepStatus;
  result?: string;
}

export const AGENT_STEPS: { id: string; label: string }[] = [
  { id: "scan", label: "Read last leaf scan" },
  { id: "retrieve", label: "Retrieve evidence from guide corpus" },
  { id: "irrigation", label: "Fetch forecast & compute irrigation plan" },
  { id: "alerts", label: "Evaluate alert rules" },
  { id: "plan", label: "Generate action plan" },
];

export interface FlowAlert {
  level: "info" | "warning" | "critical";
  title: string;
  message: string;
}

export function buildRetrievalQuery(scan: AgentScan): string {
  return `${scan.crop ?? ""} ${scan.disease} management`.trim();
}

export function evaluateFlowAlerts(
  scan: AgentScan,
  forecast: DailyWeather[],
  weatherAlerts: AgentAlert[],
): FlowAlert[] {
  const out: FlowAlert[] = [];
  const next24 = forecast[0];
  if (next24 && next24.precipitation > RAIN_POSTPONE_MM) {
    out.push({
      level: "warning",
      title: "Postpone irrigation",
      message: `${next24.precipitation.toFixed(1)} mm rain expected today (> ${RAIN_POSTPONE_MM} mm).`,
    });
  }
  const diseased = !/healthy/i.test(scan.disease);
  const humid = forecast.slice(0, 3).some((d) => d.humidity >= FUNGAL_HUMIDITY_PCT);
  if (diseased && humid) {
    out.push({
      level: "critical",
      title: "Fungal spread risk",
      message: `Humidity ≥ ${FUNGAL_HUMIDITY_PCT}% in the next 3 days while ${scan.disease} was detected.`,
    });
  }
  for (const a of weatherAlerts.slice(0, 3)) {
    out.push({ level: a.level, title: a.title, message: a.message });
  }
  return out;
}

export function buildAgentPrompt(input: {
  scan: AgentScan;
  today?: IrrigationDay | undefined;
  alerts: FlowAlert[];
}): string {
  const { scan, today, alerts } = input;
  return [
    "Create a farm action plan for today, max ~150 words, cite the numbered passages as [n].",
    `Diagnosis: ${scan.crop ? scan.crop + " — " : ""}${scan.disease} (${Math.round(scan.confidence * 100)}% confidence, engine: ${scan.engine ?? "unknown"}).`,
    today
      ? `Irrigation today: ${today.action} — ${today.waterMm} mm. Reason: ${today.reason}`
      : "Irrigation plan unavailable.",
    `Alerts: ${alerts.length ? alerts.map((a) => `${a.title}: ${a.message}`).join(" | ") : "none"}.`,
  ].join("\n");
}

export interface AgentDeps {
  readScan: () => AgentScan | null;
  fetchForecast: (lat: number, lon: number) => Promise<DailyWeather[]>;
  streamPlan: (args: { prompt: string; context: string; farm: string }, onDelta: (t: string) => void) => Promise<void>;
}

export interface AgentOutput {
  sources: RetrievedChunk[];
  alerts: FlowAlert[];
  today?: IrrigationDay | undefined;
  plan: string;
}

export async function runAgentFlow(
  farm: AgentFarm,
  deps: AgentDeps,
  onStep: (id: string, patch: Partial<AgentStep>) => void,
  onPlan: (text: string) => void,
): Promise<AgentOutput | null> {
  onStep("scan", { status: "running" });
  const scan = deps.readScan();
  if (!scan) {
    onStep("scan", { status: "error", result: "No scan found — scan a leaf first." });
    return null;
  }
  onStep("scan", {
    status: "done",
    result: `${scan.crop ? scan.crop + " · " : ""}${scan.disease} (${Math.round(scan.confidence * 100)}%)`,
  });

  onStep("retrieve", { status: "running" });
  const query = buildRetrievalQuery(scan);
  const { results } = retrieve(query);
  onStep("retrieve", {
    status: "done",
    result: results.length
      ? `${results.length} passages for "${query}" (top score ${results[0]?.score})`
      : `No passage matched "${query}"`,
  });

  onStep("irrigation", { status: "running" });
  let forecast: DailyWeather[] = [];
  let today: IrrigationDay | undefined;
  try {
    forecast = await deps.fetchForecast(farm.latitude, farm.longitude);
    const crop = CROP_WATER_PROFILES.find((c) => c.id === farm.cropId) ?? CROP_WATER_PROFILES[0];
    const soil = SOIL_PROFILES.find((s) => s.id === farm.soilId) ?? SOIL_PROFILES[0];
    if (crop && soil) {
      const schedule = buildIrrigationSchedule({
        forecast,
        latitude: farm.latitude,
        crop,
        soil,
        stage: farm.stage,
        areaHa: farm.areaHa,
        initialDepletionMm: crop.rootDepthM * soil.availableWaterMmPerM * crop.depletionFraction * 0.7,
      });
      today = schedule.days[0];
    }
    onStep("irrigation", {
      status: "done",
      result: today ? `Today: ${today.action.replace("_", " ")} · ${today.waterMm} mm` : "No plan",
    });
  } catch {
    onStep("irrigation", { status: "error", result: "Forecast unavailable" });
  }

  onStep("alerts", { status: "running" });
  const alerts = evaluateFlowAlerts(scan, forecast, forecast.length ? buildAgentAlerts(forecast) : []);
  onStep("alerts", { status: "done", result: `${alerts.length} alert(s) raised` });

  onStep("plan", { status: "running" });
  const cropName = CROP_WATER_PROFILES.find((c) => c.id === farm.cropId)?.name ?? farm.cropId;
  const farmBlock = `Location: ${farm.placeName}. Crop: ${cropName}. Soil: ${farm.soilId}. Stage: ${farm.stage}. Area: ${farm.areaHa} ha.`;
  let plan = "";
  try {
    await deps.streamPlan(
      { prompt: buildAgentPrompt({ scan, today, alerts }), context: buildContextBlock(results), farm: farmBlock },
      (t) => {
        plan += t;
        onPlan(plan);
      },
    );
    onStep("plan", { status: "done", result: `${plan.trim().split(/\s+/).length} words` });
  } catch {
    onStep("plan", { status: "error", result: "Advisor unavailable" });
  }
  return { sources: results, alerts, today, plan };
}

export const AGENT_FLOW_SPEC = {
  title: "One-click farm analysis agent",
  summary:
    "A deterministic five-step orchestration: local tools run first (scan read, TF-IDF retrieval, irrigation maths, rule-based alerts), then a single LLM call writes the plan from those outputs. Final actions are simulated — no hardware is connected.",
  steps: AGENT_STEPS.map((s) => s.label),
  rules: [
    `rain_today > ${RAIN_POSTPONE_MM} mm            -> "Postpone irrigation"`,
    `disease != healthy AND max(RH, 3 days) >= ${FUNGAL_HUMIDITY_PCT}% -> "Fungal spread risk"`,
    "query = `${crop} ${disease} management`  -> retrieve() top-3 via TF-IDF + MMR",
    "LLM input = diagnosis + passages + irrigation day + alerts + farm profile",
  ],
  thresholds: { rainPostponeMm: RAIN_POSTPONE_MM, fungalHumidityPct: FUNGAL_HUMIDITY_PCT, maxWords: 150 },
} as const;
