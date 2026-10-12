import { AlertTriangle, CloudLightning, Droplets, Flame, Pause, Play, RotateCcw, Radio, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIrrigationEngine } from "@/hooks/useIrrigationEngine";
import type { HourlyPoint } from "@/services/weather";
import { KalmanPanel, LedgerPanel, MpcPanel, TankGauge, WaterBalancePanel } from "./EnginePanels";
import { cn } from "@/lib/utils";

type Stage = "initial" | "development" | "mid" | "late";

export function IrrigationDssDashboard({ cropId, soilId, stage, hourly }: { cropId: string; soilId: string; stage: Stage; hourly: HourlyPoint[] | undefined }) {
  const engine = useIrrigationEngine(cropId, soilId, stage, hourly);
  const { state } = engine;
  const isIrrigate = state.decision === "IRRIGATE";
  const isReview = state.decision === "MANUAL_REVIEW";
  const tone = isIrrigate ? "border-primary/50 bg-primary/10" : isReview ? "border-warning/50 bg-warning/10" : "border-border bg-card";
  const simTime = state.series[state.series.length - 1]?.t ?? "—";

  return (
    <div className="agridss-dashboard space-y-4">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3"><span className={cn("absolute size-full rounded-full bg-primary/50", engine.running && "animate-ping")} /><span className="relative size-3 rounded-full bg-primary" /></span>
          <div>
            <h2 className="font-mono text-sm font-semibold text-primary">AgriDSS — Kalman · FAO-56 · MPC</h2>
            <p className="font-mono text-xs text-muted-foreground">SIM HOUR {state.hourIndex} · {simTime} · {state.crop.name} on {state.soil.name} · day {Math.floor(state.dayAfterSowing)} after sowing</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1"><Radio className="size-3" /> {engine.live ? "Live Open-Meteo hourly forecast" : "Synthetic weather (forecast unavailable)"}</Badge>
          <Badge variant="outline">Simulated field & probes</Badge>
          <Button size="sm" variant="outline" onClick={() => engine.setRunning(!engine.running)} aria-label={engine.running ? "Pause" : "Play"}>{engine.running ? <Pause /> : <Play />}</Button>
          <Button size="sm" variant={engine.speedMs === 250 ? "default" : "outline"} onClick={() => engine.setSpeedMs(engine.speedMs === 250 ? 1000 : 250)}>{engine.speedMs === 250 ? "4×" : "1×"}</Button>
        </div>
      </section>

      <section className={cn("grid gap-4 rounded-lg border p-5 md:grid-cols-[1fr_auto]", tone)}>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Decision this hour</p>
          <h3 className="font-display text-2xl font-semibold">{isReview ? "MANUAL REVIEW" : isIrrigate ? "IRRIGATE" : "HOLD"}</h3>
          <p className="mt-2 max-w-3xl text-sm">{state.reason}</p>
        </div>
        <div className="flex min-w-48 flex-col items-center gap-3">
          <div className={cn("flex size-20 items-center justify-center rounded-full border-4", state.pump ? "animate-pulse border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground")}><Droplets className="size-8" /></div>
          <p className={cn("font-mono text-sm font-semibold", state.pump ? "text-primary" : "text-muted-foreground")}>{state.pump ? "PUMP ON" : "PUMP OFF"}</p>
          <TankGauge value={state.tankPct} />
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Scenario injection</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={engine.storm}><CloudLightning /> Storm in 3 h (30 mm)</Button>
          <Button variant="secondary" onClick={engine.heatwave}><Flame /> 24 h heatwave</Button>
          <Button variant="outline" onClick={() => engine.fault("stuck")}><AlertTriangle /> Stuck 10 cm probe</Button>
          <Button variant="outline" onClick={() => engine.fault("spike")}><Zap /> Spike on 20 cm</Button>
          <Button variant="outline" onClick={() => engine.fault("drift")}><AlertTriangle /> Drifting 10 cm probe</Button>
          <Button variant="ghost" onClick={engine.reset}><RotateCcw /> Reset</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <KalmanPanel state={state} />
        <WaterBalancePanel state={state} />
      </div>
      <MpcPanel state={state} />
      <LedgerPanel state={state} />

      <Card className="min-w-0">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><span className="size-2 animate-pulse rounded-full bg-primary" /> Controller log</CardTitle></CardHeader>
        <CardContent><div className="h-48 overflow-y-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed">{state.log.map((line, i) => <div key={`${i}-${line}`} className={cn(line.includes("IRRIGATE") && "text-primary", /STUCK|SPIKE|DRIFT|MANUAL/.test(line) && "text-destructive")}>{line}</div>)}</div></CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Honest scope: the field, probes and their noise are simulated in your browser (one simulated hour per second); the weather driving it is the real hourly forecast for your farm location. Soil and crop constants are FAO-56 table values, and tariffs and pump size are assumptions.</p>
    </div>
  );
}
