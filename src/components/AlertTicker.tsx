import { AlertTriangle, Info, Radio, ShieldAlert } from "lucide-react";
import type { AgentAlert } from "@/algorithms/weatherAdvisor";
import { cn } from "@/lib/utils";

const LEVEL_STYLES: Record<AgentAlert["level"], { chip: string; icon: typeof Info }> = {
  info: { chip: "bg-primary/10 text-primary border-primary/20", icon: Info },
  warning: { chip: "bg-warning/15 text-warning-foreground border-warning/30", icon: AlertTriangle },
  critical: {
    chip: "bg-destructive/10 text-destructive border-destructive/25",
    icon: ShieldAlert,
  },
};

export function AlertTicker({ alerts, loading }: { alerts: AgentAlert[]; loading?: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest">
          Proactive agent alerts
        </h2>
        <Radio className="ml-auto size-4 text-muted-foreground" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Reading the forecast for your field…</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {alerts.map((a) => {
            const style = LEVEL_STYLES[a.level];
            const Icon = style.icon;
            return (
              <article
                key={a.id}
                className={cn(
                  "min-w-[280px] max-w-sm shrink-0 rounded-xl border p-3",
                  style.chip,
                )}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4" />
                  {a.title}
                </div>
                <p className="mt-1 text-sm leading-snug text-foreground/85">{a.message}</p>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">{a.rule}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
