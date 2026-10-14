import { useState } from "react";
import { useWebMCP } from "use-webmcp-tool";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Loader2, Play, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageResponse } from "@/components/ai-elements/message";
import { fetchForecast } from "@/services/weather";
import {
  AGENT_STEPS,
  runAgentFlow,
  type AgentFarm,
  type AgentOutput,
  type AgentScan,
  type AgentStep,
} from "@/algorithms/agentFlow";

async function streamPlan(
  args: { prompt: string; context: string; farm: string },
  onDelta: (t: string) => void,
) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "agent-1", role: "user", parts: [{ type: "text", text: args.prompt }] }],
      context: args.context,
      farm: args.farm,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Advisor error ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload) as { type?: string; delta?: string };
        if (ev.type === "text-delta" && ev.delta) onDelta(ev.delta);
      } catch {
        /* partial line */
      }
    }
  }
}

function readScan(): AgentScan | null {
  try {
    const raw = window.localStorage.getItem("agrisense.lastScan");
    return raw ? (JSON.parse(raw) as AgentScan) : null;
  } catch {
    return null;
  }
}

export function AgentFlowPanel({ farm }: { farm: AgentFarm }) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [plan, setPlan] = useState("");
  const [output, setOutput] = useState<AgentOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [noScan, setNoScan] = useState(false);

  const run = async () => {
    setRunning(true);
    setPlan("");
    setOutput(null);
    setNoScan(false);
    setSteps(AGENT_STEPS.map((s) => ({ ...s, status: "pending" })));
    const out = await runAgentFlow(
      farm,
      {
        readScan,
        fetchForecast: async (lat, lon) => (await fetchForecast(lat, lon)).daily,
        streamPlan,
      },
      (id, patch) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))),
      setPlan,
    );
    if (!out) setNoScan(true);
    setOutput(out);
    setRunning(false);
    return out;
  };

  useWebMCP({
    name: "run_farm_analysis",
    description:
      "Click 'Run farm analysis' on the dashboard: runs the five-step agent and returns the step log and action plan.",
    enabled: !running,
    execute: () =>
      runWebMCPTool("run_farm_analysis", async () => {
        const out = await run();
        if (!out) return "No leaf scan found — scan a leaf on Disease Detection first.";
        return out.plan || "Analysis finished but the advisor returned no plan.";
      }),
  });

  useWebMCP({
    name: "read_farm_analysis",
    description: "Read the current farm analysis step log and plan shown on the dashboard.",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () =>
      runWebMCPTool("read_farm_analysis", () =>
        steps.length === 0
          ? "No analysis has been run yet."
          : steps.map((s) => `${s.label}: ${s.status}${s.result ? " — " + s.result : ""}`).join("\n") +
            (plan ? `\n\nPlan:\n${plan}` : ""),
      ),
  });

  const actions = output
    ? [
        output.today?.action === "irrigate"
          ? `Irrigation scheduled: ${output.today.waterMm} mm`
          : "Irrigation rescheduled",
        ...(output.alerts.length ? [`${output.alerts.length} alert(s) queued`] : []),
        "Plan sent to farmer inbox",
      ]
    : [];

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">Farm analysis agent</CardTitle>
        <Button onClick={() => void run()} disabled={running} className="gap-2">
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run farm analysis
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground">
            One click reads your last scan, pulls guide evidence, checks the forecast and irrigation
            plan, evaluates alerts and writes an action plan.
          </p>
        )}
        {steps.length > 0 && (
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.id} className="flex gap-2 text-sm">
                {s.status === "done" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                ) : s.status === "running" ? (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
                ) : s.status === "error" ? (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className={s.status === "pending" ? "text-muted-foreground" : ""}>{s.label}</p>
                  {s.result && (
                    <p className="break-words text-xs text-muted-foreground">{s.result}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {noScan && (
          <Button asChild variant="secondary" size="sm">
            <Link to="/scanner">Scan a leaf first</Link>
          </Button>
        )}
        {plan && (
          <div className="min-w-0 rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <MessageResponse>{plan}</MessageResponse>
          </div>
        )}
        {output && output.sources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {output.sources.map((s, i) => (
              <Badge key={s.id} variant="outline" className="max-w-full truncate font-normal">
                [{i + 1}] {s.source} — {s.section}
              </Badge>
            ))}
          </div>
        )}
        {actions.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Actions · simulated - no hardware connected
            </p>
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Badge key={a} variant="secondary" className="gap-1">
                  <CheckCircle2 className="size-3" /> {a}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
