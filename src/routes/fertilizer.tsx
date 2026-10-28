import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarRange,
  ChevronDown,
  FlaskConical,
  HeartPulse,
  IndianRupee,
  MessageSquare,
  Package,
  Printer,
  RotateCcw,
  BarChart3,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CROP_TARGETS,
  GROWTH_STAGES,
  optimizeFertilizer,
  PH_P_AVAILABILITY,
  phFactor,
  seasonPlan,
  soilHealthRating,
  estimateCost,
  DEFAULT_BAG_PRICES,
  BAG_KG,
  type SoilTest,
} from "@/algorithms/fertilizerOptimizer";
import { useFarm } from "@/hooks/useFarm";

export const Route = createFileRoute("/fertilizer")({
  head: () => ({
    meta: [
      { title: "Fertilizer Optimizer — NPK dosage in kg/ha | AgriSense" },
      {
        name: "description",
        content:
          "Turn a soil test into exact urea, DAP and MOP quantities with split application timing for your crop and growth stage.",
      },
      { property: "og:title", content: "Fertilizer Optimizer — NPK dosage in kg/ha" },
      {
        property: "og:description",
        content: "Soil test in, precise fertilizer quantities and application timing out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Fertilizer,
});

function Fertilizer() {
  const { farm, update } = useFarm();
  const [stageId, setStageId] = useState("basal");
  const [baseline, setBaseline] = useState<SoilTest>(INITIAL_SOIL);
  const [soil, setSoilState] = useState<SoilTest>(INITIAL_SOIL);
  const [prices, setPrices] = useState<Record<string, number>>(DEFAULT_BAG_PRICES);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PRICE_KEY);
      if (raw) setPrices({ ...DEFAULT_BAG_PRICES, ...(JSON.parse(raw) as Record<string, number>) });
    } catch {
      /* ignore */
    }
  }, []);
  const setPrice = (name: string, v: number) =>
    setPrices((prev) => {
      const next = { ...prev, [name]: v };
      try {
        window.localStorage.setItem(PRICE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  // Typed values become the new "soil test" baseline; sliders explore what-ifs from it.
  const setSoil = (fn: (s: SoilTest) => SoilTest) => {
    setSoilState((s) => {
      const n = fn(s);
      setBaseline(n);
      return n;
    });
  };

  const cropId = CROP_TARGETS.some((c) => c.id === farm.cropId) ? farm.cropId : "wheat";
  const plan = useMemo(
    () => optimizeFertilizer({ cropId, stageId, soil, areaHa: farm.areaHa }),
    [cropId, stageId, soil, farm.areaHa],
  );
  const ph = phFactor(soil.pH);
  const basePlan = useMemo(
    () => optimizeFertilizer({ cropId, stageId, soil: baseline, areaHa: farm.areaHa }),
    [cropId, stageId, baseline, farm.areaHa],
  );
  const season = useMemo(
    () => seasonPlan({ cropId, soil, areaHa: farm.areaHa }),
    [cropId, soil, farm.areaHa],
  );
  const health = soilHealthRating(soil);
  const cost = estimateCost(plan.products, prices);
  const whatIf = JSON.stringify(soil) !== JSON.stringify(baseline);
  const cropName = CROP_TARGETS.find((c) => c.id === cropId)?.name ?? cropId;
  const stageName = GROWTH_STAGES.find((s) => s.id === stageId)?.name ?? stageId;
  const chartData = plan.rows.map((r) => ({
    nutrient: r.nutrient,
    "Soil supply": Math.min(r.available, r.target),
    Credit: Math.min(r.credit, Math.max(0, r.target - r.available)),
    Gap: r.deficit,
  }));
  const askQ = `I'm growing ${cropName} on ${farm.areaHa} ha at the "${stageName}" stage. Soil test: N ${soil.N}, P ${soil.P}, K ${soil.K} kg/ha, OC ${soil.organicCarbon}%, pH ${soil.pH}. Plan: ${
    plan.products.map((p) => `${p.product} ${p.kgPerHa} kg/ha`).join(", ") || "no fertilizer needed"
  }. Is this sensible and what should I watch for?`;
  const slider = (id: "N" | "P" | "K" | "pH", label: string, max: number, step: number) => (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="font-mono">{soil[id]}</span>
      </div>
      <Slider
        aria-label={`${label} what-if`}
        min={id === "pH" ? 4 : 0}
        max={max}
        step={step}
        value={[soil[id]]}
        onValueChange={([v]) => setSoilState((s) => ({ ...s, [id]: v ?? s[id] }))}
      />
    </div>
  );

  const numberField = (
    id: keyof SoilTest,
    label: string,
    step = 1,
    suffix?: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {suffix && <span className="text-muted-foreground">({suffix})</span>}
      </Label>
      <Input
        id={id}
        type="number"
        step={step}
        value={soil[id]}
        onChange={(e) => setSoil((s) => ({ ...s, [id]: Number(e.target.value) }))}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Fertilizer optimizer</h1>
        <p className="text-sm text-muted-foreground">
          Enter your soil health card values — dosage is computed for the selected stage only.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          <Button asChild size="sm">
            <Link to="/chat" search={{ q: askQ }}>
              <MessageSquare className="size-4" /> Ask the Agronomist
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Print plan
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="size-4" /> Season timeline — {cropName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-4">
            {season.map(({ stage, plan: sp }, i) => {
              const active = stage.id === stageId;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setStageId(stage.id)}
                  aria-pressed={active}
                  className={`rounded-xl border p-3 text-left transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}
                >
                  <p className="text-xs text-muted-foreground">Stage {i + 1}</p>
                  <p className="text-sm font-semibold leading-tight">{stage.name}</p>
                  <div className="mt-2 space-y-0.5 font-mono text-xs">
                    {sp.products.length === 0 ? (
                      <p className="text-muted-foreground">No fertilizer</p>
                    ) : (
                      sp.products.map((p) => (
                        <p key={p.product}>
                          {p.product.split(" ")[0]} {p.kgPerHa} kg/ha
                        </p>
                      ))
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-6">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="size-4" /> Inputs
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Crop</Label>
              <Select value={cropId} onValueChange={(v) => update({ cropId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CROP_TARGETS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Growth stage</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROWTH_STAGES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="areaHa">Area (hectares)</Label>
              <Input
                id="areaHa"
                type="number"
                min={0.1}
                step={0.1}
                value={farm.areaHa}
                onChange={(e) => update({ areaHa: Number(e.target.value) || 0.1 })}
              />
            </div>
            {numberField("N", "Available nitrogen", 1, "kg/ha")}
            {numberField("P", "Available phosphorus", 1, "kg/ha")}
            {numberField("K", "Available potassium", 1, "kg/ha")}
            {numberField("organicCarbon", "Organic carbon", 0.05, "%")}
            {numberField("pH", "Soil pH", 0.1)}
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              pH {soil.pH.toFixed(1)} — {ph.label}. Phosphorus availability factor{" "}
              <span className="font-mono">{ph.factor}</span>.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border sm:col-span-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-1.5 font-medium">pH band</th>
                    <th className="px-3 py-1.5 font-medium">P factor</th>
                    <th className="px-3 py-1.5 font-medium">Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {PH_P_AVAILABILITY.map((band, i, all) => (
                    <tr
                      key={band.max}
                      className={`border-b border-border/50 last:border-0 ${band.factor === ph.factor && band.label === ph.label ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-3 py-1.5 font-mono">
                        {i === 0 ? `≤ ${band.max}` : `${all[i - 1]!.max} – ${band.max}`}
                      </td>
                      <td className="px-3 py-1.5 font-mono font-semibold">{band.factor}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{band.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 print:hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">What if…</CardTitle>
            <Button size="sm" variant="ghost" disabled={!whatIf} onClick={() => setSoilState(baseline)}>
              <RotateCcw className="size-4" /> Reset to soil test
            </Button>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {slider("N", "Nitrogen", 800, 5)}
            {slider("P", "Phosphorus", 60, 1)}
            {slider("K", "Potassium", 500, 5)}
            {slider("pH", "pH", 10, 0.1)}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="size-4" /> Soil health
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              [
                ["Nitrogen", health.N],
                ["Phosphorus", health.P],
                ["Potassium", health.K],
                ["Org. carbon", health.organicCarbon],
                ["pH", health.pH],
              ] as const
            ).map(([name, lvl]) => {
              const tone =
                lvl === "medium" || lvl === "normal"
                  ? "border-success-border bg-success-soft text-success-soft-foreground"
                  : lvl === "low" || lvl === "acidic"
                    ? "border-danger-border bg-danger-soft text-danger-soft-foreground"
                    : "border-warning-border bg-warning-soft text-warning-soft-foreground";
              return (
                <div key={name} className={`rounded-lg border p-2 text-center ${tone}`}>
                  <p className="text-xs">{name}</p>
                  <p className="text-sm font-semibold capitalize">{lvl}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="size-4" /> Apply this
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.products.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Soil reserves already meet the requirement for this stage — no fertilizer needed.
                </p>
              ) : (
                plan.products.map((p) => (
                  <div
                    key={p.product}
                    className="flex items-center justify-between rounded-xl border border-border p-3"
                  >
                    <div>
                      <p className="font-display font-semibold">{p.product}</p>
                      <p className="text-xs text-muted-foreground">{p.nutrientContent}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-semibold">{p.kgPerHa} kg/ha</p>
                      {whatIf && <Delta now={p.kgPerHa} before={basePlan.products.find((b) => b.product === p.product)?.kgPerHa ?? 0} />}
                      <p className="text-xs text-muted-foreground">
                        {p.totalKg} kg for {plan.areaHa} ha
                      </p>
                    </div>
                  </div>
                ))
              )}

              {plan.warnings.map((w) => (
                <div
                  key={w}
                  className="flex gap-2 rounded-lg border border-warning-border bg-warning-soft p-3 text-sm text-warning-soft-foreground"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {w}
                </div>
              ))}
            </CardContent>
          </Card>

          {plan.products.length > 0 && (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IndianRupee className="size-4" /> Cost estimate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cost.lines.map((l) => (
                  <div key={l.product} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 font-medium">{l.product}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {l.bags} × {BAG_KG} kg bags ×
                    </span>
                    <span className="flex items-center gap-1">
                      ₹
                      <Input
                        aria-label={`${l.product} price per bag`}
                        type="number"
                        min={0}
                        className="h-8 w-24"
                        value={l.pricePerBag}
                        onChange={(e) => setPrice(l.product, Number(e.target.value) || 0)}
                      />
                    </span>
                    <span className="w-24 text-right font-mono font-semibold">
                      ₹{l.cost.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-2 font-display font-semibold">
                  <span>Total for {plan.areaHa} ha</span>
                  <span>₹{cost.total.toLocaleString("en-IN")}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Bag prices are editable defaults — enter your local dealer price.
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4" /> Where the nutrients come from (kg/ha)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis type="category" dataKey="nutrient" stroke="var(--muted-foreground)" fontSize={12} width={28} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Soil supply" stackId="a" fill="var(--chart-1)" />
                    <Bar dataKey="Credit" stackId="a" fill="var(--chart-2)" />
                    <Bar dataKey="Gap" stackId="a" fill="var(--destructive)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground">
                Red is the gap fertilizer must fill for this stage.
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="size-4" /> Application timing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.splits.map((s) => (
                <div key={s.label} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{s.label}</p>
                    <Badge variant="secondary">{Math.round(s.share * 100)}%</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.timing}</p>
                  <p className="mt-1 text-sm">{s.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Collapsible>
          <Card className="min-w-0">
            <CardHeader>
              <CollapsibleTrigger className="group flex w-full items-center justify-between text-left">
                <CardTitle className="text-base">Nutrient balance (kg/ha, elemental)</CardTitle>
                <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2">Nutrient</th>
                      <th className="py-2">Stage target</th>
                      <th className="py-2">Soil supply</th>
                      <th className="py-2">Credit</th>
                      <th className="py-2">Deficit</th>
                      <th className="py-2">Efficiency</th>
                      <th className="py-2">To apply</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {plan.rows.map((r) => (
                      <tr key={r.nutrient} className="border-b border-border/60 last:border-0">
                        <td className="py-2 font-display font-semibold">{r.nutrient}</td>
                        <td className="py-2">{r.target}</td>
                        <td className="py-2">{r.available}</td>
                        <td className="py-2">{r.credit}</td>
                        <td className="py-2">{r.deficit}</td>
                        <td className="py-2">{r.efficiency}</td>
                        <td className="py-2 font-semibold">{r.appliedElemental}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
            </CollapsibleContent>
          </Card>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}

const INITIAL_SOIL: SoilTest = { N: 240, P: 12, K: 160, organicCarbon: 0.45, pH: 7.2 };
const PRICE_KEY = "agrisense.fertilizer.prices.v1";

function Delta({ now, before }: { now: number; before: number }) {
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return <p className="text-xs text-muted-foreground">same as soil test</p>;
  const Icon = d > 0 ? ArrowUp : ArrowDown;
  return (
    <p className="flex items-center justify-end gap-0.5 text-xs text-muted-foreground">
      <Icon className="size-3" /> {Math.abs(d)} kg/ha vs soil test
    </p>
  );
}
