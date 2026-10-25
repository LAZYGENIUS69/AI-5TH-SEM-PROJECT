import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Bot, Brain, Bug, Cpu, Droplets, FlaskConical, MessagesSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Math } from "@/components/Math";
import { DISEASE_CV_SPEC } from "@/algorithms/diseaseCV";
import { RAG_SPEC } from "@/algorithms/ragEngine";
import { WEATHER_SPEC } from "@/algorithms/weatherAdvisor";
import { FERTILIZER_SPEC } from "@/algorithms/fertilizerOptimizer";
import { IRRIGATION_DSS_SPEC } from "@/algorithms/irrigationDss";
import { CNN_SPEC } from "@/algorithms/cnnClassifier";
import { AGENT_FLOW_SPEC } from "@/algorithms/agentFlow";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Algorithms,
});

interface FormulaEntry {
  label: string;
  latex: string;
  symbols: readonly { symbol: string; meaning: string; value?: string }[];
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border pt-5 first:border-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Numbered vertical stepper: number badges joined by a thin line. */
function Stepper({ items }: { items: readonly string[] }) {
  return (
    <ol className="max-w-[72ch]">
      {items.map((step, i) => (
        <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 && (
            <span className="absolute left-[13px] top-7 bottom-0 w-px bg-border" aria-hidden />
          )}
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted font-mono text-[11px] font-semibold text-primary">
            {i + 1}
          </span>
          <p className="pt-1 text-sm">{step}</p>
        </li>
      ))}
    </ol>
  );
}

/** One card per formula: label, centred display math, then a "where" legend. */
function FormulaCard({ formula }: { formula: FormulaEntry }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {formula.label}
      </p>
      <Math block tex={formula.latex} />
      {formula.symbols.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1 pr-4 font-medium">Symbol</th>
                <th className="py-1 pr-4 font-medium">Meaning</th>
                <th className="py-1 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {formula.symbols.map((s) => (
                <tr key={s.symbol} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-4">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {s.symbol}
                    </code>
                  </td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{s.meaning}</td>
                  <td className="py-1.5 text-muted-foreground">{s.value ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormulaGrid({ formulas }: { formulas: readonly FormulaEntry[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {formulas.map((f) => (
        <FormulaCard key={f.label} formula={f} />
      ))}
    </div>
  );
}

/** Parameters / thresholds as chips with inline-code identifiers. */
function KeyValues({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(data).map(([k, v]) => (
        <Badge key={k} variant="secondary" className="gap-1.5 font-normal">
          <code className="font-mono text-[11px]">{k}</code>
          <span className="font-mono text-[11px] font-semibold">{String(v)}</span>
        </Badge>
      ))}
    </div>
  );
}

function Limitations({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-warning-border bg-warning-soft p-3 text-sm text-warning-soft-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0">{children}</p>
    </div>
  );
}

function SpecHeader({ title, summary }: { title: string; summary: string }) {
  return (
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <p className="max-w-[72ch] text-sm text-muted-foreground">{summary}</p>
    </CardHeader>
  );
}

function Algorithms() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Algorithm inspector</h1>
        <p className="max-w-[72ch] text-sm text-muted-foreground">
          Each engine lives in <code className="font-mono text-xs">src/algorithms/</code> as pure,
          UI-free TypeScript. The formulas, weights and thresholds below are exported by those same
          files, so what you read here is exactly what runs.
        </p>
      </div>

      <Tabs defaultValue="disease">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="disease" className="gap-2">
            <Bug className="size-4" /> diseaseCV.ts
          </TabsTrigger>
          <TabsTrigger value="cnn" className="gap-2">
            <Brain className="size-4" /> cnnClassifier.ts
          </TabsTrigger>
          <TabsTrigger value="agent" className="gap-2">
            <Bot className="size-4" /> agentFlow.ts
          </TabsTrigger>
          <TabsTrigger value="rag" className="gap-2">
            <MessagesSquare className="size-4" /> ragEngine.ts
          </TabsTrigger>
          <TabsTrigger value="weather" className="gap-2">
            <Droplets className="size-4" /> weatherAdvisor.ts
          </TabsTrigger>
          <TabsTrigger value="sensor" className="gap-2">
            <Cpu className="size-4" /> irrigationDss.ts
          </TabsTrigger>
          <TabsTrigger value="fertilizer" className="gap-2">
            <FlaskConical className="size-4" /> fertilizerOptimizer.ts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="disease">
          <Card>
            <SpecHeader title={DISEASE_CV_SPEC.title} summary={DISEASE_CV_SPEC.summary} />
            <CardContent className="space-y-6">
              <Limitations>{DISEASE_CV_SPEC.honestyNote}</Limitations>
              <Section title="Pipeline">
                <Stepper items={DISEASE_CV_SPEC.stages} />
              </Section>
              <Section title="Formulas">
                <FormulaGrid formulas={DISEASE_CV_SPEC.formulas} />
              </Section>
              <Section title="Parameters / thresholds">
                <KeyValues data={{ ...DISEASE_CV_SPEC.weights, ...DISEASE_CV_SPEC.thresholds }} />
              </Section>
              <Section title="Classes / outputs">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {DISEASE_CV_SPEC.classes.map((c) => (
                    <div key={c} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                      {c}
                    </div>
                  ))}
                </div>
              </Section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cnn">
          <Card>
            <SpecHeader title={CNN_SPEC.title} summary={CNN_SPEC.summary} />
            <CardContent className="space-y-6">
              <Section title="Architecture">
                <Stepper items={CNN_SPEC.architecture} />
              </Section>
              <Section title="Inference pipeline">
                <Stepper items={CNN_SPEC.pipeline} />
              </Section>
              <Section title="Formulas">
                <FormulaGrid formulas={CNN_SPEC.formulas} />
              </Section>
              <Section title="Parameters / thresholds">
                <KeyValues data={CNN_SPEC.thresholds} />
              </Section>
              <Section title="Files read at runtime">
                <KeyValues data={CNN_SPEC.sources} />
              </Section>
              <Section title="Dataset">
                <Limitations>{CNN_SPEC.dataset}</Limitations>
              </Section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent">
          <Card>
            <SpecHeader title={AGENT_FLOW_SPEC.title} summary={AGENT_FLOW_SPEC.summary} />
            <CardContent className="space-y-6">
              <Section title="Steps">
                <Stepper items={AGENT_FLOW_SPEC.steps} />
              </Section>
              <Section title="Rules">
                <Stepper items={AGENT_FLOW_SPEC.rules} />
              </Section>
              <Section title="Parameters / thresholds">
                <KeyValues data={AGENT_FLOW_SPEC.thresholds} />
              </Section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rag">
          <Card>
            <SpecHeader title={RAG_SPEC.title} summary={RAG_SPEC.summary} />
            <CardContent className="space-y-6">
              <Limitations>{RAG_SPEC.limitations}</Limitations>
              <Section title="Pipeline">
                <Stepper items={RAG_SPEC.pipeline} />
              </Section>
              <Section title="Formulas">
                <FormulaGrid formulas={RAG_SPEC.formulas} />
              </Section>
              <Section title="Parameters / thresholds">
                <KeyValues data={{ ...RAG_SPEC.thresholds, corpusChunks: RAG_SPEC.corpusSize }} />
              </Section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weather">
          <Card>
            <SpecHeader title={WEATHER_SPEC.title} summary={WEATHER_SPEC.summary} />
            <CardContent className="space-y-6">
              <Section title="Formulas">
                <FormulaGrid formulas={WEATHER_SPEC.formulas} />
              </Section>
              <Section title="Irrigation decision gates">
                <Stepper items={WEATHER_SPEC.decisionTree} />
              </Section>
              <Section title="Parameters / thresholds">
                <KeyValues data={WEATHER_SPEC.thresholds} />
              </Section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sensor">
          <Card>
            <SpecHeader title={IRRIGATION_DSS_SPEC.title} summary={IRRIGATION_DSS_SPEC.summary} />
            <CardContent className="space-y-6">
              <Limitations>{IRRIGATION_DSS_SPEC.limitations}</Limitations>
              <Section title="Formulas">
                <FormulaGrid formulas={IRRIGATION_DSS_SPEC.formulas} />
              </Section>
              <Section title="Decision gates">
                <Stepper items={IRRIGATION_DSS_SPEC.decisionTree} />
              </Section>
              <Section title="Parameters / thresholds">
                <KeyValues data={{ ...IRRIGATION_DSS_SPEC.weights, ...IRRIGATION_DSS_SPEC.thresholds }} />
              </Section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fertilizer">
          <Card>
            <SpecHeader title={FERTILIZER_SPEC.title} summary={FERTILIZER_SPEC.summary} />
            <CardContent className="space-y-6">
              <Section title="Formulas">
                <FormulaGrid formulas={FERTILIZER_SPEC.formulas} />
              </Section>
              <Section title="Phosphorus availability by soil pH">
                <div className="max-w-[72ch] overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">pH band</th>
                        <th className="px-3 py-2 font-medium">Factor</th>
                        <th className="px-3 py-2 font-medium">Interpretation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FERTILIZER_SPEC.phTable.map((band, i, all) => (
                        <tr key={band.max} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs">
                            {i === 0 ? `≤ ${band.max}` : `${all[i - 1]!.max} – ${band.max}`}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs font-semibold">{band.factor}</td>
                          <td className="px-3 py-2 text-muted-foreground">{band.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Section title="Parameters / thresholds">
                <KeyValues data={{ ...FERTILIZER_SPEC.weights, ...FERTILIZER_SPEC.thresholds }} />
              </Section>
              <Section title="Stage nutrient shares">
                <Stepper items={FERTILIZER_SPEC.stages} />
              </Section>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
