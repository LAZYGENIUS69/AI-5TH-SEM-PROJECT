import {
  AlertTriangle,
  CloudRain,
  Cpu,
  Droplets,
  Gauge,
  Radio,
  Sprout,
  Sun,
  Waves,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useIrrigationSimulation } from "@/hooks/useIrrigationSimulation";
import type { SensorCropType } from "@/algorithms/irrigationDss";
import { Math } from "@/components/Math";
import { cn } from "@/lib/utils";

const SENSOR_CROPS: { value: SensorCropType; label: string }[] = [
  { value: "wheat", label: "Wheat" },
  { value: "rice", label: "Rice" },
  { value: "maize", label: "Maize" },
];

function Metric({ label, value, detail, warning }: { label: string; value: string; detail: React.ReactNode; warning?: boolean }) {
  return (
    <Card className={cn(warning && "border-warning/60 bg-warning/5")}>
      <CardHeader className="pb-1"><p className="text-xs font-medium uppercase text-muted-foreground">{label}</p></CardHeader>
      <CardContent>
        <p className={cn("font-mono text-2xl font-semibold text-primary", warning && "text-warning-foreground")}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function SensorCard({ label, depth, value, fault, dataKey, history }: {
  label: string;
  depth: string;
  value: number;
  fault: "static" | "spike" | null;
  dataKey: "depth10" | "depth20" | "depth30";
  history: { depth10: number; depth20: number; depth30: number }[];
}) {
  const tone = value > 60 ? "text-success" : value > 40 ? "text-warning-foreground" : "text-destructive";
  return (
    <Card>
      <CardHeader className="pb-1">
        <p className="font-mono text-[11px] text-muted-foreground">{depth}</p>
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <p className={cn("font-mono text-3xl font-semibold", tone)}>{value.toFixed(1)}%</p>
          {fault && <Badge variant="destructive">{fault === "spike" ? "Spike" : "Static fault"}</Badge>}
        </div>
        <div className="mt-3 h-10" aria-label={`${label} recent trend`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}><Line type="monotone" dataKey={dataKey} stroke="var(--color-primary)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function IrrigationDssDashboard({ initialCrop, onCropChange }: { initialCrop: SensorCropType; onCropChange: (crop: SensorCropType) => void }) {
  const { state, triggerDrought, triggerRain, triggerFault, setRainDetected, setCropType } = useIrrigationSimulation(initialCrop);
  useEffect(() => setCropType(initialCrop), [initialCrop, setCropType]);
  const irrigateVotes = state.knn.neighbors.filter((neighbor) => neighbor.label === "IRRIGATE").length;
  const isIrrigate = state.decision === "IRRIGATE";
  const isReview = state.decision === "MANUAL_REVIEW";
  const decisionTone = isIrrigate ? "border-destructive/50 bg-destructive/10 text-destructive" : isReview ? "border-warning/50 bg-warning/10 text-warning-foreground" : "border-success/50 bg-success/10 text-success";
  const reasoning = `SM at ${state.smSmoothed.toFixed(1)}% ${state.smSmoothed < 45 ? "below" : "above"} the 45% field-capacity threshold. ETc is ${state.etc.toFixed(2)} mm/day. ${irrigateVotes}/5 neighbors recommend irrigation.${state.fault.sensor ? ` ${state.fault.sensor} is flagged.` : ""}`;

  return (
    <div className="agridss-dashboard space-y-4">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3"><span className="absolute size-full animate-ping rounded-full bg-primary/50" /><span className="relative size-3 rounded-full bg-primary" /></span>
          <div><h2 className="font-mono text-sm font-semibold text-primary">AgriDSS — Irrigation Decision Support System</h2><p className="font-mono text-xs text-muted-foreground">LIVE · TICK {state.tick}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1"><Radio className="size-3" /> Simulation mode</Badge>
          {state.fault.sensor && <Badge variant="destructive">Fault detected</Badge>}
          {state.activeScenario && <Badge variant="secondary" className="capitalize">{state.activeScenario} event</Badge>}
          {isIrrigate && <Badge variant="destructive" className="animate-pulse">Irrigating</Badge>}
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">System signal path</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {[{ icon: Sprout, label: "3 soil probes" }, { icon: Cpu, label: "Sensor fusion" }, { icon: Waves, label: "SMA filter" }, { icon: Gauge, label: "KNN model" }, { icon: CloudRain, label: "Safety gates" }, { icon: Droplets, label: "Water pump" }, { icon: Radio, label: "Dashboard" }].map((node, index) => (
            <div key={node.label} className="relative flex min-h-20 items-center gap-2 rounded-md border border-border bg-secondary p-3 sm:flex-col sm:justify-center sm:text-center">
              <node.icon className={cn("size-5 text-primary", index === 5 && state.pumpStatus && "animate-bounce text-destructive")} />
              <span className="text-xs font-medium">{node.label}</span>
               {index < 6 && <span className="absolute -right-2 top-1/2 z-10 hidden size-3 -translate-y-1/2 rotate-45 border-r border-t border-primary bg-secondary lg:block" />}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <SensorCard label="Primary moisture" depth="DEPTH 10 CM · W₁ 0.5" value={state.sensors.depth10} fault={state.fault.sensor === "depth10" ? state.fault.type : null} dataKey="depth10" history={state.sensorHistory} />
        <SensorCard label="Secondary moisture" depth="DEPTH 20 CM · W₂ 0.3" value={state.sensors.depth20} fault={state.fault.sensor === "depth20" ? state.fault.type : null} dataKey="depth20" history={state.sensorHistory} />
        <SensorCard label="Deep moisture" depth="DEPTH 30 CM · W₃ 0.2" value={state.sensors.depth30} fault={state.fault.sensor === "depth30" ? state.fault.type : null} dataKey="depth30" history={state.sensorHistory} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="SM fused" value={`${state.smFused.toFixed(1)}%`} detail={<Math tex="0.5\,SM_{10}+0.3\,SM_{20}+0.2\,SM_{30}" />} />
        <Metric label="SM normalized" value={`${state.smNorm.toFixed(1)}%`} detail="Field capacity threshold: 45%" warning={state.smNorm < 45} />
        <Metric label="ET₀ / ETc" value={state.et0.toFixed(2)} detail={`ETc: ${state.etc.toFixed(2)} mm/day`} />
        <Metric label="Temperature / humidity" value={`${state.sensors.temperature.toFixed(1)}°C`} detail={`Relative humidity: ${state.sensors.humidity.toFixed(1)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr_0.7fr]">
        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-sm">Processing pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {["Raw sensor input", "Fault detection", "SMA filter n=6", "Normalization", "ET₀ calculation", "KNN inference k=5", `Decision · ${state.decision}`].map((step, index) => (
              <div key={step} className={cn("flex items-center gap-2 rounded-md border p-2 text-xs", index === 5 && "border-primary/50 bg-primary/5", index === 6 && decisionTone)}><span className="size-2 shrink-0 rounded-full bg-primary" />{step}</div>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">KNN neighbor retrieval</CardTitle><Badge variant={state.model === "KNN" ? "default" : "secondary"}>{state.model === "KNN" ? "KNN k=5" : "Naive Bayes"}</Badge></CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto"><table className="w-full min-w-[430px] text-left text-xs"><thead><tr className="border-b text-muted-foreground"><th className="pb-2">SM%</th><th>Temp</th><th>RH</th><th>ETc</th><th>Label</th><th>Distance</th></tr></thead><tbody>{state.knn.neighbors.map((neighbor, index) => <tr key={`${neighbor.sm}-${index}`} className="border-b border-border/60 font-mono"><td className="py-2">{neighbor.sm.toFixed(1)}</td><td>{neighbor.temp.toFixed(1)}</td><td>{neighbor.rh.toFixed(0)}</td><td>{neighbor.etc.toFixed(1)}</td><td className={neighbor.label === "IRRIGATE" ? "text-destructive" : "text-success"}>{neighbor.label}</td><td className="text-muted-foreground">{neighbor.distance.toFixed(3)}</td></tr>)}</tbody></table></div>
            <div><div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Confidence</span><span className="font-mono">{Math.round(state.knn.confidence * 100)}%</span></div><Progress value={state.knn.confidence * 100} /></div>
            {state.model === "NAIVE_BAYES" && <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/50 p-3 text-xs"><span>P(Irrigate) <b className="font-mono">{(state.bayes.pIrrigate * 100).toFixed(1)}%</b></span><span>P(Hold) <b className="font-mono">{(state.bayes.pHold * 100).toFixed(1)}%</b></span></div>}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-sm">Pump control</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-4 text-center">
             <div className={cn("flex size-28 items-center justify-center rounded-full border-4", state.pumpStatus ? "animate-pulse border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground")}><Droplets className="size-10" /></div>
            <div><p className={cn("font-mono text-lg font-semibold", state.pumpStatus ? "text-primary" : "text-muted-foreground")}>{state.pumpStatus ? "PUMP ON" : "PUMP OFF"}</p><p className="text-xs text-muted-foreground">{state.pumpStatus ? "Applying water" : "Monitoring field"}</p></div>
            <div className="w-full"><div className="mb-1 flex justify-between text-xs"><span>Tank level</span><span className="font-mono">{Math.round(state.waterTankLevel)}%</span></div><Progress value={state.waterTankLevel} /></div>
          </CardContent>
        </Card>
      </div>

      <section className={cn("flex flex-col gap-4 rounded-lg border p-5 sm:flex-row sm:items-center sm:justify-between", decisionTone)}>
        <div><p className="text-xs font-medium uppercase text-muted-foreground">Decision</p><h3 className={cn("font-display text-2xl font-semibold", isIrrigate && "animate-pulse")}>{isReview ? "MANUAL REVIEW" : isIrrigate ? "IRRIGATE NOW" : "HOLD"}</h3><p className="mt-2 max-w-2xl text-xs text-foreground/75">{reasoning}</p></div>
        <div className="shrink-0 sm:text-right"><p className="text-xs text-muted-foreground">Confidence</p><p className="font-mono text-3xl font-semibold">{Math.round(state.knn.confidence * 100)}%</p><p className="font-mono text-xs text-muted-foreground">Model: {state.model}</p></div>
      </section>

      <Card>
        <CardHeader><CardTitle className="text-sm">Soil moisture trend</CardTitle></CardHeader>
        <CardContent><div className="h-52"><ResponsiveContainer width="100%" height="100%"><AreaChart data={state.history}><CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" /><XAxis dataKey="tick" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} /><ReferenceLine y={45} stroke="var(--color-destructive)" strokeDasharray="4 3" /><Area type="monotone" dataKey="smNorm" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.13} strokeWidth={2} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div></CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0"><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><span className="size-2 animate-pulse rounded-full bg-primary" /> Serial Monitor — 115200 baud</CardTitle></CardHeader><CardContent><div className="h-48 overflow-y-auto rounded-md border bg-background p-3 font-mono text-xs leading-6 text-primary">{state.serialLog.length ? state.serialLog.map((line) => <div key={line}>{line}</div>) : <span className="text-muted-foreground">Waiting for readings…</span>}</div></CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle className="text-sm">Algorithm performance comparison</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[430px] text-left text-xs"><thead><tr className="border-b text-muted-foreground"><th className="pb-2">Algorithm</th><th>Accuracy</th><th>RMSE</th><th>Interpretability</th></tr></thead><tbody>{[{ name: "KNN (k=5)", key: "KNN", accuracy: "98.3%", rmse: "0.12", rating: "High" }, { name: "Naive Bayes", key: "NAIVE_BAYES", accuracy: "95.1%", rmse: "0.18", rating: "Very high" }, { name: "Logistic regression", key: "LOGISTIC_REG", accuracy: "92.4%", rmse: "0.22", rating: "High" }, { name: "Neural net", key: "NEURAL_NET", accuracy: "97.8%", rmse: "0.14", rating: "Low" }].map((row) => <tr key={row.name} className={cn("border-b", row.key === state.model && "bg-primary/5")}><td className="py-3 font-medium">{row.name} {row.key === state.model && <Badge className="ml-1">Active</Badge>}</td><td className="font-mono">{row.accuracy}</td><td className="font-mono">{row.rmse}</td><td>{row.rating}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-muted-foreground">Reference figures from the original AgriDSS project — not measured by this app. KNN is selected for accuracy with interpretable neighbor evidence.</p></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card><CardHeader><CardTitle className="text-sm">Crop configuration</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-3 gap-2">{SENSOR_CROPS.map((crop) => <Button key={crop.value} type="button" variant={state.cropType === crop.value ? "default" : "outline"} onClick={() => { setCropType(crop.value); onCropChange(crop.value); }}>{crop.label}</Button>)}</div><div className="rounded-md border bg-muted/40 p-3 font-mono text-sm text-primary">Kc = {state.kc.toFixed(2)} <span className="font-sans text-xs text-muted-foreground">(mid-season)</span></div><div className="flex items-center justify-between"><div><p className="text-sm font-medium">Rain detected</p><p className="text-xs text-muted-foreground">{state.rainDetected ? "Irrigation paused" : "Clear conditions"}</p></div><Switch aria-label="Rain detected" checked={state.rainDetected} onCheckedChange={setRainDetected} /></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Scenario injection</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><Button variant="destructive" onClick={triggerDrought}><Sun /> Drought onset</Button><Button variant="secondary" onClick={triggerRain}><CloudRain /> Rain event</Button><Button variant="outline" className="border-warning/60 text-warning-foreground" onClick={triggerFault}><AlertTriangle /> Sensor fault</Button></CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle className="text-sm">Decision log</CardTitle></CardHeader><CardContent>{state.log.length ? <div className="divide-y">{state.log.map((entry, index) => <div key={`${entry.timestamp}-${index}`} className="grid grid-cols-2 gap-2 py-2 text-xs sm:grid-cols-4"><span className="font-mono text-muted-foreground">{entry.timestamp}</span><span className="font-mono">{entry.smNorm.toFixed(1)}% SM</span><span>{entry.model}</span><span className={entry.decision === "IRRIGATE" ? "text-destructive" : entry.decision === "MANUAL_REVIEW" ? "text-warning-foreground" : "text-success"}>{entry.decision}</span></div>)}</div> : <p className="text-sm text-muted-foreground">The first decision change will appear here.</p>}</CardContent></Card>
    </div>
  );
}