import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEngine, injectFault, injectHeatwave, injectStorm, stepEngine, syntheticWeather, type EngineState, type EngineWeatherHour } from "@/algorithms/irrigationEngine";
import type { HourlyPoint } from "@/services/weather";

type Stage = "initial" | "development" | "mid" | "late";

/** Runs the closed-loop engine in the browser: one simulated hour per tick. */
export function useIrrigationEngine(cropId: string, soilId: string, stage: Stage, hourly: HourlyPoint[] | undefined) {
  const weather = useMemo<EngineWeatherHour[]>(() => {
    if (!hourly?.length) return syntheticWeather();
    const nowKey = new Date().toISOString().slice(0, 13);
    const start = Math.max(0, hourly.findIndex((h) => h.time.slice(0, 13) >= nowKey));
    return [...hourly.slice(start), ...hourly.slice(0, start)];
  }, [hourly]);
  const live = Boolean(hourly?.length);
  const [state, setState] = useState<EngineState>(() => createEngine(cropId, soilId, stage));
  const [running, setRunning] = useState(true);
  const [speedMs, setSpeedMs] = useState(1000);
  const weatherRef = useRef(weather);
  weatherRef.current = weather;

  useEffect(() => {
    setState(() => {
      let s = createEngine(cropId, soilId, stage);
      for (let i = 0; i < 6; i++) s = stepEngine(s, weatherRef.current);
      return s;
    });
  }, [cropId, soilId, stage, weather]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setState((s) => stepEngine(s, weatherRef.current)), speedMs);
    return () => window.clearInterval(id);
  }, [running, speedMs]);

  const storm = useCallback(() => setState((s) => injectStorm(s)), []);
  const heatwave = useCallback(() => setState((s) => injectHeatwave(s)), []);
  const fault = useCallback((kind: "stuck" | "spike" | "drift") => setState((s) => injectFault(s, kind, kind === "spike" ? 1 : 0)), []);
  const reset = useCallback(() => setState(createEngine(cropId, soilId, stage)), [cropId, soilId, stage]);

  return { state, weather, live, running, setRunning, speedMs, setSpeedMs, storm, heatwave, fault, reset };
}
