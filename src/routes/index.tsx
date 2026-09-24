import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bug,
  CloudRain,
  Droplets,
  FlaskConical,
  MessagesSquare,
  Sprout,
  Thermometer,
  Wind,
} from "lucide-react";
import { AlertTicker } from "@/components/AlertTicker";
import { LocationPicker } from "@/components/LocationPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFarm, useForecast } from "@/hooks/useFarm";
import { describeWeather } from "@/services/weather";
import {
  buildAgentAlerts,
  buildIrrigationSchedule,
  CROP_WATER_PROFILES,
  SOIL_PROFILES,
} from "@/algorithms/weatherAdvisor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AgriSense Dashboard — live field advisory" },
      {
        name: "description",
        content:
          "Live weather alerts, today's irrigation decision and crop health status for your field, in one dashboard.",
      },
      { property: "og:title", content: "AgriSense Dashboard — live field advisory" },
      {
        property: "og:description",
        content:
          "Live weather alerts, today's irrigation decision and crop health status for your field.",
      },
    ],
  }),
  component: Dashboard,
});

interface StoredScan {
  disease: string;
  confidence: number;
  severity: string;
  at: string;
}

function Dashboard() {
  const { farm, update } = useFarm();
  const { data, isLoading, isError } = useForecast(farm.latitude, farm.longitude);
  const [lastScan, setLastScan] = useState<StoredScan | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("agrisense.lastScan");
      if (raw) setLastScan(JSON.parse(raw) as StoredScan);
    } catch {
      /* ignore */
    }
  }, []);

  const alerts = useMemo(() => (data ? buildAgentAlerts(data.daily) : []), [data]);

  const schedule = useMemo(() => {
    if (!data) return null;
    const crop = CROP_WATER_PROFILES.find((c) => c.id === farm.cropId) ?? CROP_WATER_PROFILES[0]!;
    const soil = SOIL_PROFILES.find((s) => s.id === farm.soilId) ?? SOIL_PROFILES[0]!;
    return buildIrrigationSchedule({
      forecast: data.daily,
      latitude: farm.latitude,
      crop,
      soil,
      stage: farm.stage,
      areaHa: farm.areaHa,
      initialDepletionMm: crop.rootDepthM * soil.availableWaterMmPerM * crop.depletionFraction * 0.7,
    });
  }, [data, farm]);

  const today = schedule?.days[0];
  const cropName = CROP_WATER_PROFILES.find((c) => c.id === farm.cropId)?.name ?? farm.cropId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Field dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {cropName} · {farm.areaHa} ha · {farm.stage} stage
          </p>
        </div>
        <LocationPicker placeName={farm.placeName} onSelect={update} />
      </div>

      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Weather could not be loaded for this location. Check your connection and try again.
        </div>
      )}

      <AlertTicker alerts={alerts} loading={isLoading} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Thermometer className="size-4" /> Right now
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold">
              {data ? `${Math.round(data.current.temperature)}°C` : "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              {data ? describeWeather(data.current.weatherCode) : "Loading"}
            </p>
            <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Droplets className="size-3" /> {data ? `${Math.round(data.current.humidity)}%` : "—"}
              </span>
              <span className="flex items-center gap-1">
                <Wind className="size-3" />{" "}
                {data ? `${Math.round(data.current.windSpeed)} km/h` : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Droplets className="size-4" /> Irrigation today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold capitalize">
              {today ? today.action.replace("_", " ") : "—"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {today?.action === "irrigate"
                ? `${today.waterMm} mm · ${(today.litresPerHa * farm.areaHa).toLocaleString()} L total`
                : "No water needed today"}
            </p>
            <Button asChild variant="link" className="mt-2 h-auto p-0">
              <Link to="/irrigation">
                Open 7-day plan <ArrowRight className="size-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CloudRain className="size-4" /> Rain next 7 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold">
              {data
                ? `${data.daily.reduce((a, d) => a + d.precipitation, 0).toFixed(0)} mm`
                : "—"}
            </p>
            <div className="mt-3 flex items-end gap-1">
              {data?.daily.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${Math.min(40, 4 + d.precipitation * 2)}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(d.date).toLocaleDateString(undefined, { weekday: "narrow" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sprout className="size-4" /> Last leaf scan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastScan ? (
              <>
                <p className="font-display text-lg font-semibold leading-tight">
                  {lastScan.disease}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="secondary">{Math.round(lastScan.confidence * 100)}% match</Badge>
                  <Badge
                    variant={lastScan.severity === "High" ? "destructive" : "outline"}
                  >
                    {lastScan.severity}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(lastScan.at).toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No scan yet — photograph a leaf to check crop health.
              </p>
            )}
            <Button asChild variant="link" className="mt-2 h-auto p-0">
              <Link to="/scanner">
                Scan a leaf <ArrowRight className="size-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            to: "/chat",
            icon: MessagesSquare,
            title: "Ask the agronomist",
            body: "Grounded answers with the extension guide passage shown alongside.",
          },
          {
            to: "/fertilizer",
            icon: FlaskConical,
            title: "Optimise fertilizer",
            body: "Turn a soil test into exact urea, DAP and MOP quantities.",
          },
          {
            to: "/scanner",
            icon: Bug,
            title: "Detect disease",
            body: "Photograph a leaf and get a diagnosis with remediation steps.",
          },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
          >
            <item.icon className="size-5 text-primary" />
            <h3 className="mt-3 font-display text-base font-semibold">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Open <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
