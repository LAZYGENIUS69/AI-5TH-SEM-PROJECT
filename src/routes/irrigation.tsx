import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { CalendarClock, CloudRain, Droplets, PauseCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocationPicker } from "@/components/LocationPicker";
import { useFarm, useForecast } from "@/hooks/useFarm";
import {
  buildIrrigationSchedule,
  CROP_WATER_PROFILES,
  SOIL_PROFILES,
  STAGE_KEYS,
  type StageKey,
} from "@/algorithms/weatherAdvisor";

export const Route = createFileRoute("/irrigation")({
  head: () => ({
    meta: [
      { title: "Irrigation Planner — 7-day water plan | AgriSense" },
      {
        name: "description",
        content:
          "Evapotranspiration-based irrigation schedule with rain delays, water depth in mm and litres per hectare.",
      },
      { property: "og:title", content: "Irrigation Planner — 7-day water plan" },
      {
        property: "og:description",
        content: "Know exactly which days to irrigate, how much, and when rain makes it unnecessary.",
      },
    ],
  }),
  component: Irrigation,
});

const ACTION_STYLE = {
  irrigate: { label: "Irrigate", icon: Droplets, cls: "bg-primary/10 text-primary border-primary/25" },
  hold: { label: "Hold", icon: PauseCircle, cls: "bg-muted text-muted-foreground border-border" },
  postpone_rain: {
    label: "Postponed — rain",
    icon: CloudRain,
    cls: "bg-warning/15 text-warning-foreground border-warning/35",
  },
} as const;

function Irrigation() {
  const { farm, update } = useFarm();
  const { data, isLoading } = useForecast(farm.latitude, farm.longitude);

  const crop = CROP_WATER_PROFILES.find((c) => c.id === farm.cropId) ?? CROP_WATER_PROFILES[0]!;
  const soil = SOIL_PROFILES.find((s) => s.id === farm.soilId) ?? SOIL_PROFILES[0]!;

  const schedule = useMemo(() => {
    if (!data) return null;
    return buildIrrigationSchedule({
      forecast: data.daily,
      latitude: farm.latitude,
      crop,
      soil,
      stage: farm.stage,
      areaHa: farm.areaHa,
      initialDepletionMm: crop.rootDepthM * soil.availableWaterMmPerM * crop.depletionFraction * 0.7,
    });
  }, [data, farm, crop, soil]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Irrigation planner</h1>
          <p className="text-sm text-muted-foreground">
            Daily root-zone water balance driven by the live forecast.
          </p>
        </div>
        <LocationPicker placeName={farm.placeName} onSelect={update} />
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Crop</Label>
            <Select value={farm.cropId} onValueChange={(v) => update({ cropId: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CROP_WATER_PROFILES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Soil type</Label>
            <Select value={farm.soilId} onValueChange={(v) => update({ soilId: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOIL_PROFILES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Growth stage</Label>
            <Select
              value={farm.stage}
              onValueChange={(v) => update({ stage: v as StageKey })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_KEYS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="area">Area (hectares)</Label>
            <Input
              id="area"
              type="number"
              min={0.1}
              step={0.1}
              value={farm.areaHa}
              onChange={(e) => update({ areaHa: Number(e.target.value) || 0.1 })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Allowable depletion (RAW)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">{schedule?.raw ?? "—"} mm</p>
            <p className="text-xs text-muted-foreground">
              {soil.availableWaterMmPerM} mm/m × {crop.rootDepthM} m × {crop.depletionFraction}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Water needed this week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">
              {schedule?.totalWaterMm ?? "—"} mm
            </p>
            <p className="text-xs text-muted-foreground">
              {schedule
                ? `${(schedule.totalWaterMm * 10000 * farm.areaHa).toLocaleString()} litres over ${farm.areaHa} ha`
                : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Crop coefficient (Kc)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">{crop.kc[farm.stage]}</p>
            <p className="text-xs capitalize text-muted-foreground">{farm.stage} stage · {crop.name}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4" /> Seven-day schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Building the plan…</p>}
          <div className="space-y-3">
            {schedule?.days.map((d) => {
              const style = ACTION_STYLE[d.action];
              const Icon = style.icon;
              return (
                <div
                  key={d.date}
                  className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center"
                >
                  <div className="w-28 shrink-0">
                    <p className="font-display text-sm font-semibold">
                      {new Date(d.date).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <Badge variant="outline" className={`mt-1 gap-1 ${style.cls}`}>
                      <Icon className="size-3" />
                      {style.label}
                    </Badge>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{d.reason}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      ET₀ {d.et0} mm · ETc {d.etc} mm · effective rain {d.effectiveRain} mm ·
                      depletion {d.depletionAfter} mm
                    </p>
                  </div>
                  <div className="text-right sm:w-36">
                    <p className="font-display text-lg font-semibold">
                      {d.waterMm > 0 ? `${d.waterMm} mm` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.waterMm > 0
                        ? `${(d.litresPerHa * farm.areaHa).toLocaleString()} L`
                        : "no application"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
