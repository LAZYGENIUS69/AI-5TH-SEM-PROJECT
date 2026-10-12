import { createFileRoute } from "@tanstack/react-router";
import { Bug, Cpu, Droplets, FlaskConical, MessagesSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DISEASE_CV_SPEC } from "@/algorithms/diseaseCV";
import { RAG_SPEC } from "@/algorithms/ragEngine";
import { WEATHER_SPEC } from "@/algorithms/weatherAdvisor";
import { FERTILIZER_SPEC } from "@/algorithms/fertilizerOptimizer";
import { FAO56_SPEC } from "@/algorithms/fao56DualKc";
import { KALMAN_SPEC } from "@/algorithms/soilKalman";
import { MPC_SPEC } from "@/algorithms/irrigationMpc";
import { KalmanPanel, LedgerPanel, MpcPanel, WaterBalancePanel } from "@/components/irrigation/EnginePanels";
import { useIrrigationEngine } from "@/hooks/useIrrigationEngine";
import { useFarm, useHourlyForecast } from "@/hooks/useFarm";

export const Route = createFileRoute("/algorithms")({
  head: () => ({
    meta: [
      { title: "Algorithm Inspector — the maths behind AgriSense" },
      {
        name: "description",
        content:
          "Every formula, weight and threshold used by the disease, retrieval, irrigation and fertilizer engines, read straight from the source.",
      },
      { property: "og:title", content: "Algorithm Inspector — the maths behind AgriSense" },
      {
        property: "og:description",
        content: "Formulas, scoring weights and rule trees for all four advisory engines.",
      },
    ],
  }),
  component: Algorithms,
});

function CodeBlock({ lines }: { lines: readonly string[] }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-muted/60 p-4 font-mono text-[12.5px] leading-relaxed">
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </pre>
  );
}

function KeyValues({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(data).map(([k, v]) => (
        <Badge key={k} variant="secondary" className="font-mono text-[11px]">
          {k} = {String(v)}
        </Badge>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function List({ items }: { items: readonly string[] }) {
  return (
    <ol className="space-y-1.5 text-sm">
      {items.map((s, i) => (
        <li key={s} className="flex gap-3">
          <span className="font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Algorithms() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Algorithm inspector</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Each engine lives in <code className="font-mono text-xs">src/algorithms/</code> as pure,
          UI-free TypeScript. The formulas, weights and thresholds below are exported by those same
          files, so what you read here is exactly what runs.
        </p>
      </div>

      <Tabs defaultValue="disease">
        <TabsList className="flex-wrap">
          <TabsTrigger value="disease" className="gap-2">
            <Bug className="size-4" /> diseaseCV.ts
          </TabsTrigger>
          <TabsTrigger value="rag" className="gap-2">
            <MessagesSquare className="size-4" /> ragEngine.ts
          </TabsTrigger>
          <TabsTrigger value="weather" className="gap-2">
            <Droplets className="size-4" /> weatherAdvisor.ts
          </TabsTrigger>
          <TabsTrigger value="kalman" className="gap-2">
            <Cpu className="size-4" /> soilKalman.ts
          </TabsTrigger>
          <TabsTrigger value="fao56" className="gap-2">
            <Droplets className="size-4" /> fao56DualKc.ts
          </TabsTrigger>
          <TabsTrigger value="mpc" className="gap-2">
            <Cpu className="size-4" /> irrigationMpc.ts
          </TabsTrigger>
          <TabsTrigger value="fertilizer" className="gap-2">
            <FlaskConical className="size-4" /> fertilizerOptimizer.ts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="disease">
          <Card>
            <CardHeader>
              <CardTitle>{DISEASE_CV_SPEC.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{DISEASE_CV_SPEC.summary}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <Section title="Pipeline">
                <List items={DISEASE_CV_SPEC.stages} />
              </Section>
              <Section title="Formulas">
                <CodeBlock lines={DISEASE_CV_SPEC.formulas} />
              </Section>
              <Section title="Feature weights">
                <KeyValues data={DISEASE_CV_SPEC.weights} />
              </Section>
              <Section title="Thresholds">
                <KeyValues data={DISEASE_CV_SPEC.thresholds} />
              </Section>
              <Section title="Classes">
                <div className="flex flex-wrap gap-2">
                  {DISEASE_CV_SPEC.classes.map((c) => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))}
                </div>
              </Section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rag">
          <Card>
            <CardHeader>
              <CardTitle>{RAG_SPEC.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{RAG_SPEC.summary}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <Section title="Pipeline">
                <List items={RAG_SPEC.pipeline} />
              </Section>
              <Section title="Scoring">
                <CodeBlock lines={RAG_SPEC.formulas} />
              </Section>
              <Section title="Retrieval configuration">
                <KeyValues data={{ ...RAG_SPEC.thresholds, corpusChunks: RAG_SPEC.corpusSize }} />
              </Section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weather">
          <Card>
            <CardHeader>
              <CardTitle>{WEATHER_SPEC.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{WEATHER_SPEC.summary}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <Section title="Formulas">
                <CodeBlock lines={WEATHER_SPEC.formulas} />
              </Section>
              <Section title="Irrigation decision tree">
                <CodeBlock lines={WEATHER_SPEC.decisionTree} />
              </Section>
              <Section title="Alert thresholds">
                <KeyValues data={WEATHER_SPEC.thresholds} />
              </Section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kalman">
          <SpecCard spec={KALMAN_SPEC} extraTitle="Filter configuration" extra={KALMAN_SPEC.config} />
          <LivePanel which="kalman" />
        </TabsContent>
        <TabsContent value="fao56">
          <SpecCard spec={FAO56_SPEC} extraTitle="Constants" extra={FAO56_SPEC.constants} />
          <LivePanel which="fao56" />
        </TabsContent>
        <TabsContent value="mpc">
          <SpecCard spec={MPC_SPEC} extraTitle="Controller configuration" extra={MPC_SPEC.config} />
          <LivePanel which="mpc" />
        </TabsContent>

        <TabsContent value="fertilizer">
          <Card>
            <CardHeader>
              <CardTitle>{FERTILIZER_SPEC.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{FERTILIZER_SPEC.summary}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <Section title="Formulas">
                <CodeBlock lines={FERTILIZER_SPEC.formulas} />
              </Section>
              <Section title="Recovery efficiency">
                <KeyValues data={FERTILIZER_SPEC.weights} />
              </Section>
              <Section title="Thresholds">
                <KeyValues data={FERTILIZER_SPEC.thresholds} />
              </Section>
              <Section title="Stage nutrient shares">
                <List items={FERTILIZER_SPEC.stages} />
              </Section>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SpecCard({ spec, extraTitle, extra }: { spec: { title: string; summary: string; formulas: readonly string[]; assumptions?: readonly string[] }; extraTitle: string; extra: Record<string, unknown> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{spec.summary}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <Section title="Formulas">
          <CodeBlock lines={spec.formulas} />
        </Section>
        <Section title={extraTitle}>
          <KeyValues data={extra} />
        </Section>
        {spec.assumptions && (
          <Section title="Assumptions and limits">
            <List items={spec.assumptions} />
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function LivePanel({ which }: { which: "kalman" | "fao56" | "mpc" }) {
  const { farm } = useFarm();
  const hourly = useHourlyForecast(farm.latitude, farm.longitude);
  const { state } = useIrrigationEngine(farm.cropId, farm.soilId, farm.stage, hourly.data);
  return (
    <div className="mt-4 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live state — same engine as the irrigation page</h3>
      {which === "kalman" && <KalmanPanel state={state} />}
      {which === "fao56" && (
        <>
          <WaterBalancePanel state={state} />
          <LedgerPanel state={state} />
        </>
      )}
      {which === "mpc" && <MpcPanel state={state} />}
    </div>
  );
}
