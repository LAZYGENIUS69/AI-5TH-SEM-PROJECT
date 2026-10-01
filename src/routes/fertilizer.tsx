import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, FlaskConical, Package } from "lucide-react";
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
  phFactor,
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
    ],
  }),
  component: Fertilizer,
});

function Fertilizer() {
  const { farm, update } = useFarm();
  const [stageId, setStageId] = useState("basal");
  const [soil, setSoil] = useState<SoilTest>({
    N: 240,
    P: 12,
    K: 160,
    organicCarbon: 0.45,
    pH: 7.2,
  });

  const cropId = CROP_TARGETS.some((c) => c.id === farm.cropId) ? farm.cropId : "wheat";
  const plan = useMemo(
    () => optimizeFertilizer({ cropId, stageId, soil, areaHa: farm.areaHa }),
    [cropId, stageId, soil, farm.areaHa],
  );
  const ph = phFactor(soil.pH);

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
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
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
          </CardContent>
        </Card>

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
                  className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {w}
                </div>
              ))}
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

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base">Nutrient balance (kg/ha, elemental)</CardTitle>
            </CardHeader>
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
          </Card>
        </div>
      </div>
    </div>
  );
}
