import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { CalendarClock, CloudRain, Droplets, PauseCircle } from "lucide-react";
import { IrrigationDssDashboard } from "@/components/irrigation/IrrigationDssDashboard";
import { LocationPicker } from "@/components/LocationPicker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFarm, useForecast, useHourlyForecast } from "@/hooks/useFarm";
import { buildIrrigationSchedule, CROP_WATER_PROFILES, SOIL_PROFILES, STAGE_KEYS, type StageKey } from "@/algorithms/weatherAdvisor";

export const Route = createFileRoute("/irrigation")({
  head: () => ({ meta: [
    { title: "Live Irrigation Decision System | AgriSense" },
    { name: "description", content: "Kalman-filtered soil probes, FAO-56 dual crop coefficient water balance and 72-hour model predictive pump scheduling." },
    { property: "og:title", content: "AgriSense Live Irrigation Decision System" },
    { property: "og:description", content: "Watch a Kalman observer, FAO-56 water ledger and 72-hour MPC plan schedule irrigation against the live forecast." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Irrigation,
});

const ACTION_STYLE = {
  irrigate: { label: "Irrigate", icon: Droplets, cls: "bg-primary/10 text-primary border-primary/25" },
  hold: { label: "Hold", icon: PauseCircle, cls: "bg-muted text-muted-foreground border-border" },
  postpone_rain: { label: "Postponed — rain", icon: CloudRain, cls: "bg-warning/15 text-warning-foreground border-warning/35" },
} as const;

function Irrigation() {
  const { farm, update } = useFarm();
  const { data, isLoading } = useForecast(farm.latitude, farm.longitude);
  const crop = CROP_WATER_PROFILES.find((item) => item.id === farm.cropId) ?? CROP_WATER_PROFILES[0];
  const soil = SOIL_PROFILES.find((item) => item.id === farm.soilId) ?? SOIL_PROFILES[0];
  const schedule = useMemo(() => {
    if (!data || !crop || !soil) return null;
    return buildIrrigationSchedule({ forecast: data.daily, latitude: farm.latitude, crop, soil, stage: farm.stage, areaHa: farm.areaHa, initialDepletionMm: crop.rootDepthM * soil.availableWaterMmPerM * crop.depletionFraction * 0.7 });
  }, [data, farm, crop, soil]);
  const hourly = useHourlyForecast(farm.latitude, farm.longitude);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display text-3xl font-semibold">Irrigation control</h1><p className="text-sm text-muted-foreground">Kalman-filtered probes, FAO-56 dual-Kc water balance and a 72-hour predictive pump schedule. Wheat, rice and maize use full FAO-56 parameters; other crops fall back to wheat.</p></div><LocationPicker placeName={farm.placeName} onSelect={update} /></div>
      <IrrigationDssDashboard cropId={farm.cropId} soilId={farm.soilId} stage={farm.stage} hourly={hourly.data} />

      <section className="space-y-4 border-t border-border pt-8">
        <div><h2 className="font-display text-2xl font-semibold">Seven-day field plan</h2><p className="text-sm text-muted-foreground">The existing forecast model converts evapotranspiration and rain into daily water volumes.</p></div>
        <Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-1.5"><Label>Crop</Label><Select value={farm.cropId} onValueChange={(cropId) => update({ cropId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CROP_WATER_PROFILES.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Soil type</Label><Select value={farm.soilId} onValueChange={(soilId) => update({ soilId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SOIL_PROFILES.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Growth stage</Label><Select value={farm.stage} onValueChange={(stage) => update({ stage: stage as StageKey })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STAGE_KEYS.map((stage) => <SelectItem key={stage} value={stage} className="capitalize">{stage}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="area">Area (hectares)</Label><Input id="area" type="number" min={0.1} step={0.1} value={farm.areaHa} onChange={(event) => update({ areaHa: Number(event.target.value) || 0.1 })} /></div></CardContent></Card>
        <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Allowable depletion" value={`${schedule?.raw ?? "—"} mm`} detail={soil && crop ? `${soil.availableWaterMmPerM} mm/m × ${crop.rootDepthM} m × ${crop.depletionFraction}` : ""} /><MetricCard label="Water needed this week" value={`${schedule?.totalWaterMm ?? "—"} mm`} detail={schedule ? `${(schedule.totalWaterMm * 10000 * farm.areaHa).toLocaleString()} litres over ${farm.areaHa} ha` : ""} /><MetricCard label="Crop coefficient" value={crop ? String(crop.kc[farm.stage]) : "—"} detail={`${farm.stage} stage · ${crop?.name ?? ""}`} /></div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="size-4" /> Seven-day schedule</CardTitle></CardHeader><CardContent>{isLoading && <p className="text-sm text-muted-foreground">Building the plan…</p>}<div className="space-y-3">{schedule?.days.map((day) => { const style = ACTION_STYLE[day.action]; const Icon = style.icon; return <div key={day.date} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"><div className="w-32 shrink-0"><p className="font-display text-sm font-semibold">{new Date(day.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</p><Badge variant="outline" className={`mt-1 gap-1 ${style.cls}`}><Icon className="size-3" />{style.label}</Badge></div><div className="flex-1"><p className="text-sm">{day.reason}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">ET₀ {day.et0} mm · ETc {day.etc} mm · rain {day.effectiveRain} mm · depletion {day.depletionAfter} mm</p></div><div className="sm:w-36 sm:text-right"><p className="font-display text-lg font-semibold">{day.waterMm > 0 ? `${day.waterMm} mm` : "—"}</p><p className="text-xs text-muted-foreground">{day.waterMm > 0 ? `${(day.litresPerHa * farm.areaHa).toLocaleString()} L` : "no application"}</p></div></div>; })}</div></CardContent></Card>
      </section>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="font-display text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}