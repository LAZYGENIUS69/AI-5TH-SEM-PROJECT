import { useCallback, useEffect, useRef, useState } from "react";
import {
  hargreavesET0,
  knn,
  naiveBayes,
  normalize,
  SENSOR_CROP_KC,
  sma,
  weightedFusion,
  type BayesResult,
  type DecisionType,
  type FaultStatus,
  type KNNResult,
  type ModelType,
  type SensorCropType,
  type SensorReading,
} from "@/algorithms/irrigationDss";

export interface DecisionLogEntry {
  timestamp: string;
  smNorm: number;
  model: ModelType;
  decision: DecisionType;
}

export interface SimulationState {
  tick: number;
  sensors: SensorReading;
  fault: FaultStatus;
  smFused: number;
  smNorm: number;
  smSmoothed: number;
  et0: number;
  etc: number;
  knn: KNNResult;
  bayes: BayesResult;
  decision: DecisionType;
  model: ModelType;
  irrigationCount: number;
  fixedScheduleCount: number;
  history: { tick: number; smNorm: number }[];
  sensorHistory: { depth10: number; depth20: number; depth30: number }[];
  log: DecisionLogEntry[];
  activeScenario: "drought" | "rain" | null;
  rainDetected: boolean;
  waterTankLevel: number;
  pumpStatus: boolean;
  cropType: SensorCropType;
  kc: number;
  serialLog: string[];
}

const initialKnn: KNNResult = { label: "HOLD", confidence: 1, neighbors: [] };

function initialState(cropType: SensorCropType): SimulationState {
  return {
    tick: 0,
    sensors: { depth10: 72, depth20: 68, depth30: 65, temperature: 28, humidity: 62 },
    fault: { sensor: null, type: null },
    smFused: 0,
    smNorm: 0,
    smSmoothed: 0,
    et0: 0,
    etc: 0,
    knn: initialKnn,
    bayes: { pIrrigate: 0.3, pHold: 0.7 },
    decision: "HOLD",
    model: "KNN",
    irrigationCount: 0,
    fixedScheduleCount: 0,
    history: [],
    sensorHistory: [],
    log: [],
    activeScenario: null,
    rainDetected: false,
    waterTankLevel: 85,
    pumpStatus: false,
    cropType,
    kc: SENSOR_CROP_KC[cropType],
    serialLog: [],
  };
}

export function useIrrigationSimulation(initialCrop: SensorCropType = "wheat") {
  const [state, setState] = useState(() => initialState(initialCrop));
  const tickRef = useRef(0);
  const depthsRef = useRef({ d10: 72, d20: 68, d30: 65 });
  const smHistoryRef = useRef<number[]>([]);
  const scenarioRef = useRef<{ type: "drought" | "rain" | null; remaining: number }>({ type: null, remaining: 0 });
  const faultRef = useRef<{ sensor: FaultStatus["sensor"]; remaining: number; type: FaultStatus["type"] }>({ sensor: null, remaining: 0, type: null });
  const rainDetectedRef = useRef(false);
  const cropTypeRef = useRef<SensorCropType>(initialCrop);
  const waterTankLevelRef = useRef(85);

  const triggerDrought = useCallback(() => {
    scenarioRef.current = { type: "drought", remaining: 60 };
  }, []);
  const triggerRain = useCallback(() => {
    scenarioRef.current = { type: "rain", remaining: 40 };
  }, []);
  const triggerFault = useCallback(() => {
    faultRef.current = { sensor: "depth10", remaining: 12, type: "static" };
  }, []);
  const setRainDetected = useCallback((value: boolean) => {
    rainDetectedRef.current = value;
    setState((previous) => ({ ...previous, rainDetected: value }));
  }, []);
  const setCropType = useCallback((value: SensorCropType) => {
    cropTypeRef.current = value;
    setState((previous) => ({ ...previous, cropType: value, kc: SENSOR_CROP_KC[value] }));
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      tickRef.current += 1;
      const tick = tickRef.current;
      const scenario = scenarioRef.current;
      const faultState = faultRef.current;
      const rainDetected = rainDetectedRef.current;
      const cropType = cropTypeRef.current;
      const kc = SENSOR_CROP_KC[cropType];
      const rate = scenario.type === "drought" ? 3 : 1;

      if (scenario.remaining > 0) scenario.remaining -= 1;
      else scenario.type = null;

      let { d10, d20, d30 } = depthsRef.current;
      d10 = Math.max(15, d10 - 0.4 * rate);
      d20 = Math.max(15, d20 - 0.3 * rate);
      d30 = Math.max(15, d30 - 0.2 * rate);

      let fault: FaultStatus = { sensor: null, type: null };
      if (faultState.remaining > 0) {
        fault = { sensor: faultState.sensor, type: faultState.type };
        faultState.remaining -= 1;
        if (faultState.sensor === "depth10") d10 = depthsRef.current.d10;
        if (faultState.sensor === "depth20") d20 = depthsRef.current.d20;
        if (faultState.sensor === "depth30") d30 = depthsRef.current.d30;
      } else {
        faultRef.current = { sensor: null, remaining: 0, type: null };
      }

      depthsRef.current = { d10, d20, d30 };
      const temperature = 31 + 7 * Math.sin(((tick % 288) * 2 * Math.PI) / 288 - Math.PI / 2);
      const humidity = rainDetected || scenario.type === "rain" ? 95 : 85 - ((temperature - 24) / 14) * 45;
      const tankBefore = Math.max(0, waterTankLevelRef.current - 0.1);
      const smFused = weightedFusion(d10, d20, d30);
      const smNorm = normalize(smFused);
      smHistoryRef.current = [...smHistoryRef.current.slice(-10), smNorm];
      const smSmoothed = sma(smHistoryRef.current);
      const { et0, etc } = hargreavesET0(temperature, kc);
      const knnResult = knn(smSmoothed, temperature, humidity, etc);
      const bayesResult = naiveBayes(smSmoothed);

      let decision: DecisionType = "HOLD";
      let model: ModelType = "KNN";
      if (rainDetected || scenario.type === "rain" || tankBefore < 10) decision = "HOLD";
      else if (smSmoothed < 35) decision = "IRRIGATE";
      else if (knnResult.confidence >= 0.85) decision = knnResult.label;
      else {
        decision = "MANUAL_REVIEW";
        model = "NAIVE_BAYES";
      }

      const pumpStatus = decision === "IRRIGATE";
      const waterTankLevel = Math.min(100, Math.max(0, tankBefore + (pumpStatus ? 5 : 0)));
      waterTankLevelRef.current = waterTankLevel;
      if (pumpStatus) {
        depthsRef.current = {
          d10: Math.min(90, depthsRef.current.d10 + 18),
          d20: Math.min(90, depthsRef.current.d20 + 18),
          d30: Math.min(90, depthsRef.current.d30 + 18),
        };
      }

      setState((previous) => {
        const changed = decision !== previous.decision;
        const logEntry: DecisionLogEntry = {
          timestamp: new Date().toLocaleTimeString(),
          smNorm: Number(smSmoothed.toFixed(1)),
          model,
          decision,
        };
        const serialLine = `T${tick} · SM ${smSmoothed.toFixed(1)}% · ETc ${etc.toFixed(2)} mm/d · ${decision}${fault.sensor ? ` · FAULT ${fault.sensor}` : ""}`;
        return {
          tick,
          sensors: { depth10: d10, depth20: d20, depth30: d30, temperature, humidity },
          fault,
          smFused: Number(smFused.toFixed(2)),
          smNorm: Number(smNorm.toFixed(2)),
          smSmoothed: Number(smSmoothed.toFixed(2)),
          et0: Number(et0.toFixed(3)),
          etc: Number(etc.toFixed(3)),
          knn: knnResult,
          bayes: bayesResult,
          decision,
          model,
          irrigationCount: previous.irrigationCount + (pumpStatus ? 1 : 0),
          fixedScheduleCount: previous.fixedScheduleCount + (tick % 288 === 0 ? 1 : 0),
          history: [...previous.history.slice(-59), { tick, smNorm: Number(smSmoothed.toFixed(2)) }],
          sensorHistory: [...previous.sensorHistory.slice(-39), { depth10: d10, depth20: d20, depth30: d30 }],
          log: changed ? [logEntry, ...previous.log].slice(0, 10) : previous.log,
          activeScenario: scenario.type,
          rainDetected,
          waterTankLevel: Number(waterTankLevel.toFixed(1)),
          pumpStatus,
          cropType,
          kc,
          serialLog: [...previous.serialLog, serialLine].slice(-12),
        };
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  return { state, triggerDrought, triggerRain, triggerFault, setRainDetected, setCropType };
}