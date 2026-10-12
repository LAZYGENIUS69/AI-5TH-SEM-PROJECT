import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { EngineState } from "@/algorithms/irrigationEngine";
import { KF_CONFIG } from "@/algorithms/soilKalman";
import { cn } from "@/lib/utils";

const axis = { fontSize: 10, fill: "var(--color-muted-foreground)" };
const tip = { contentStyle: { background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 11, borderRadius: 6 }, labelStyle: { color: "var(--color-foreground)" } };
const DEPTHS = ["10 cm", "20 cm", "30 cm"] as const;
const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)"] as const;
const f = (v: number | undefined, d = 2) => (v ?? 0).toFixed(d);

export function KalmanPanel({ state }: { state: EngineState }) {
  const step = state.kfStep;
  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm">Kalman observer — soil profile (vol %)</CardTitle>
        <Badge variant="outline" className="font-mono">NIS d² {f(step?.mahalanobis2)}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {DEPTHS.map((label, i) => {
            const fault = step?.faults[i] ?? null;
            const sigma = Math.sqrt(state.kf.P[i]?.[i] ?? 0);
            return (
              <div key={label} className={cn("rounded-md border p-3", fault && "border-destructive/60 bg-destructive/5")}>
                <div className="flex items-center justify-between"><span className="font-mono text-[11px] text-muted-foreground">θ @ {label}</span>{fault ? <Badge variant="destructive" className="uppercase">{fault}</Badge> : <Badge variant="secondary">fused</Badge>}</div>
                <p className="mt-1 font-mono text-2xl font-semibold" style={{ color: COLORS[i] }}>{f(state.kf.x[i], 1)}%</p>
                <p className="font-mono text-[11px] text-muted-foreground">raw {f(state.z[i], 1)} · ±{f(sigma)} σ · K {f(step?.gain[i]?.[i])}</p>
                <p className="font-mono text-[11px] text-muted-foreground">innovation {f(step?.normalized[i])} σ</p>
              </div>
            );
          })}
        </div>
        <div className="h-48" aria-label="Raw probe readings and Kalman estimates">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={state.series}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={axis} interval="preserveStartEnd" minTickGap={30} />
              <YAxis tick={axis} domain={["auto", "auto"]} width={32} />
              <Tooltip {...tip} />
              {(["10", "20", "30"] as const).map((d, i) => <Scatter key={`z${d}`} dataKey={`z${d}`} name={`raw ${d} cm`} fill={COLORS[i]} opacity={0.35} isAnimationActive={false} />)}
              {(["10", "20", "30"] as const).map((d, i) => <Line key={`x${d}`} dataKey={`x${d}`} name={`estimate ${d} cm`} stroke={COLORS[i]} dot={false} strokeWidth={2} isAnimationActive={false} />)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Normalised innovation yᵢ/√Sᵢᵢ — readings outside ±{KF_CONFIG.gateSigma}σ are rejected</p>
          <div className="h-36" aria-label="Kalman residuals">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={state.series}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={axis} interval="preserveStartEnd" minTickGap={30} />
                <YAxis tick={axis} domain={[-6, 6]} allowDataOverflow width={32} />
                <Tooltip {...tip} />
                <ReferenceLine y={KF_CONFIG.gateSigma} stroke="var(--color-destructive)" strokeDasharray="4 4" />
                <ReferenceLine y={-KF_CONFIG.gateSigma} stroke="var(--color-destructive)" strokeDasharray="4 4" />
                {(["10", "20", "30"] as const).map((d, i) => <Line key={d} dataKey={`r${d}`} name={`residual ${d} cm`} stroke={COLORS[i]} dot={false} strokeWidth={1.5} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">Root-zone weights from Zr: {state.rootWeights.map((w) => w.toFixed(2)).join(" / ")} → θ_root {f(state.thetaRoot, 1)}%</p>
      </CardContent>
    </Card>
  );
}

export function WaterBalancePanel({ state }: { state: EngineState }) {
  const r = state.row;
  const taw = r?.taw ?? 1;
  const rawPct = ((r?.raw ?? 0) / taw) * 100;
  const coeffs = r ? [["Kcb", r.kcb], ["Ke", r.ke], ["Kr", r.kr], ["Ks", r.ks], ["Kc,max", r.kcMax], ["few", r.few], ["Zr m", r.zr], ["TEW mm", r.tew]] as const : [];
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle className="text-sm">FAO-56 dual-Kc root-zone balance</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border p-2"><p className="text-[11px] text-muted-foreground">TAW</p><p className="font-mono text-lg font-semibold">{f(r?.taw, 1)} mm</p></div>
          <div className="rounded-md border p-2"><p className="text-[11px] text-muted-foreground">RAW (p·TAW)</p><p className="font-mono text-lg font-semibold">{f(r?.raw, 1)} mm</p></div>
          <div className={cn("rounded-md border p-2", state.drEstimate > (r?.raw ?? Infinity) && "border-warning/60 bg-warning/10")}><p className="text-[11px] text-muted-foreground">Dr estimate</p><p className="font-mono text-lg font-semibold">{f(state.drEstimate, 1)} mm</p></div>
        </div>
        <div>
          <div className="relative h-4 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (state.drEstimate / taw) * 100)}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-destructive" style={{ left: `${rawPct}%` }} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>0 · field capacity</span><span>RAW · stress begins</span><span>TAW · wilting</span></div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">Observer Dr̂ {f(state.drEstimate, 1)} mm vs simulated true Dr {f(state.drTruth, 1)} mm</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {coeffs.map(([k, v]) => <div key={k} className="rounded-md bg-muted/50 p-2"><p className="font-mono text-[10px] text-muted-foreground">{k}</p><p className="font-mono text-sm font-semibold">{v.toFixed(k.includes("mm") ? 1 : 3)}</p></div>)}
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">ETc,adj = ({f(r?.ks)}·{f(r?.kcb)} + {f(r?.ke)}) · {f(r?.et0, 3)} = {f(r?.etcAdj, 3)} mm/h</p>
      </CardContent>
    </Card>
  );
}

export function LedgerPanel({ state }: { state: EngineState }) {
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle className="text-sm">FAO-56 daily water ledger (simulated days)</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-right font-mono text-xs">
            <thead><tr className="border-b text-muted-foreground"><th className="py-2 text-left">Day</th><th>h</th><th>ET₀</th><th>Kcb</th><th>Ke</th><th>Ks</th><th>ETc,adj</th><th>P</th><th>RO</th><th>I</th><th>DP</th><th>Dr end</th><th>RAW</th></tr></thead>
            <tbody>
              {state.ledger.map((d) => (
                <tr key={d.day} className="border-b border-border/60">
                  <td className="py-1.5 text-left">{d.day.slice(5)}</td><td>{d.hours}</td><td>{f(d.et0, 1)}</td><td>{f(d.kcb)}</td><td>{f(d.ke)}</td><td className={cn(d.ks < 1 && "text-destructive")}>{f(d.ks)}</td><td>{f(d.etcAdj, 1)}</td><td>{f(d.rain, 1)}</td><td>{f(d.runoff, 1)}</td><td className="text-primary">{f(d.irrigation, 1)}</td><td>{f(d.deepPercolation, 1)}</td><td>{f(d.drEnd, 1)}</td><td>{f(d.raw, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">mm per day. Dr,t = Dr,t−1 − (P − RO) − I + ETc,adj + DP. Partial days show hours simulated so far.</p>
      </CardContent>
    </Card>
  );
}

export function MpcPanel({ state }: { state: EngineState }) {
  const plan = state.plan;
  const base = state.baselinePlan;
  const data = plan?.steps.map((s, i) => ({ t: s.time.slice(5, 13).replace("T", " "), dr: s.drAfter, base: base?.steps[i]?.drAfter, rain: s.rain, pump: s.pump ? s.grossMm : 0, tariff: s.tariff })) ?? [];
  const raw = state.row?.raw ?? 0;
  const rows = plan && base ? [
    ["Water pumped", `${f(plan.grossWaterMm, 1)} mm`, `${f(base.grossWaterMm, 1)} mm`],
    ["Pump hours", String(plan.pumpHours), String(base.pumpHours)],
    ["Energy cost", `₹${f(plan.energyCost, 0)}`, `₹${f(base.energyCost, 0)}`],
    ["Stress (Dr>RAW)", `${f(plan.stressMmH, 1)} mm·h`, `${f(base.stressMmH, 1)} mm·h`],
    ["Objective J", f(plan.totalCost, 0), f(base.totalCost, 0)],
  ] : [];
  const totals = [
    ["Water pumped", `${f(state.mpcTotals.waterMm, 1)} mm`, `${f(state.baselineTotals.waterMm, 1)} mm`],
    ["Energy cost", `₹${f(state.mpcTotals.energyCost, 0)}`, `₹${f(state.baselineTotals.energyCost, 0)}`],
    ["Stress", `${f(state.mpcTotals.stressMmH, 1)} mm·h`, `${f(state.baselineTotals.stressMmH, 1)} mm·h`],
  ];
  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm">72-hour MPC dispatch (re-solved every hour)</CardTitle>
        <Badge variant="outline" className="font-mono">{plan?.pumpHours ?? 0} pump h planned</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-60" aria-label="72 hour plan">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={axis} interval={11} />
              <YAxis yAxisId="dr" tick={axis} width={32} />
              <YAxis yAxisId="mm" orientation="right" tick={axis} width={28} />
              <Tooltip {...tip} />
              <ReferenceLine yAxisId="dr" y={raw} stroke="var(--color-destructive)" strokeDasharray="4 4" label={{ value: "RAW", fill: "var(--color-destructive)", fontSize: 10, position: "insideTopLeft" }} />
              <Bar yAxisId="mm" dataKey="rain" name="expected rain mm" fill="var(--color-chart-2)" opacity={0.6} isAnimationActive={false} />
              <Bar yAxisId="mm" dataKey="pump" name="pump mm" fill="var(--color-primary)" isAnimationActive={false} />
              <Line yAxisId="dr" dataKey="dr" name="Dr (MPC)" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="dr" dataKey="base" name="Dr (threshold rule)" stroke="var(--color-muted-foreground)" strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex h-3 overflow-hidden rounded" aria-label="Tariff by hour">
          {data.map((d, i) => <div key={i} className={cn("flex-1", d.tariff <= 4.5 ? "bg-success/60" : d.tariff >= 8 ? "bg-destructive/60" : "bg-warning/50")} />)}
        </div>
        <p className="text-[11px] text-muted-foreground">Tariff strip: green off-peak ₹4.5, amber day ₹6.5, red peak ₹8 per kWh (assumed bands).</p>
        <div className="grid gap-4 md:grid-cols-2">
          <CompareTable title="Next 72 h (forecast)" rows={rows} />
          <CompareTable title="Since start (simulated field)" rows={totals} />
        </div>
      </CardContent>
    </Card>
  );
}

function CompareTable({ title, rows }: { title: string; rows: readonly (readonly string[])[] }) {
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-xs font-medium">{title}</p>
      <table className="w-full text-xs">
        <thead><tr className="border-b text-muted-foreground"><th className="py-1 text-left font-normal">Metric</th><th className="text-right font-normal">MPC</th><th className="text-right font-normal">Threshold rule</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r[0]} className="border-b border-border/60 font-mono"><td className="py-1.5 font-sans">{r[0]}</td><td className="text-right text-primary">{r[1]}</td><td className="text-right">{r[2]}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function TankGauge({ value }: { value: number }) {
  return <div className="w-full"><div className="mb-1 flex justify-between text-xs"><span>Tank level</span><span className="font-mono">{Math.round(value)}%</span></div><Progress value={value} /></div>;
}
