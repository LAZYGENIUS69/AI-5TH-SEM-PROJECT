import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageUp, Loader2, ShieldAlert, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  diagnoseLeaf,
  extractLeafFeatures,
  type DiagnosisResult,
} from "@/algorithms/diseaseCV";

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "Crop Scanner — leaf disease detection | AgriSense" },
      {
        name: "description",
        content:
          "Photograph a crop leaf and get a disease name, confidence score, severity rating and remediation steps.",
      },
      { property: "og:title", content: "Crop Scanner — leaf disease detection" },
      {
        property: "og:description",
        content: "Leaf photo in, disease name, severity and treatment steps out.",
      },
    ],
  }),
  component: Scanner,
});

const STEPS = [
  "Resizing frame and reading pixels",
  "Converting RGB to HSV colour space",
  "Segmenting leaf tissue from background",
  "Extracting chlorosis, necrosis and lesion features",
  "Matching against the disease signature matrix",
];

const SEVERITY_STYLE: Record<string, string> = {
  Low: "bg-success/15 text-success border-success/30",
  Medium: "bg-warning/20 text-warning-foreground border-warning/40",
  High: "bg-destructive/10 text-destructive border-destructive/30",
};

function Scanner() {
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [step, setStep] = useState(-1);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const analyse = useCallback(async (file: File) => {
    setResult(null);
    const url = URL.createObjectURL(file);
    setPreview(url);

    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      toast.error("That file could not be read as an image.");
    });

    const scale = 256 / Math.max(img.width || 1, img.height || 1, 1);
    const w = Math.max(1, Math.round((img.width || 256) * Math.min(1, scale)));
    const h = Math.max(1, Math.round((img.height || 256) * Math.min(1, scale)));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      toast.error("This browser cannot process images.");
      return;
    }
    ctx.drawImage(img, 0, 0, w, h);

    for (let i = 0; i < STEPS.length; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 260));
    }

    const { data } = ctx.getImageData(0, 0, w, h);
    const features = extractLeafFeatures(data, w, h);
    const diagnosis = diagnoseLeaf(features);
    setStep(-1);
    setResult(diagnosis);

    try {
      window.localStorage.setItem(
        "agrisense.lastScan",
        JSON.stringify({
          disease: diagnosis.top.name,
          confidence: diagnosis.top.confidence,
          severity: diagnosis.severity,
          at: new Date().toISOString(),
        }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void analyse(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Crop scanner</h1>
        <p className="text-sm text-muted-foreground">
          Fill the frame with one leaf in even daylight for the most reliable reading.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leaf image</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="field-grid flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40">
              {preview ? (
                <img src={preview} alt="Leaf to analyse" className="size-full object-cover" />
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Sprout className="mx-auto mb-2 size-8 text-primary/60" />
                  No image yet
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onPick}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={onPick}
              />
              <Button className="flex-1 gap-2" onClick={() => fileRef.current?.click()}>
                <ImageUp className="size-4" /> Upload photo
              </Button>
              <Button
                variant="secondary"
                className="flex-1 gap-2"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="size-4" /> Take photo
              </Button>
            </div>

            {step >= 0 && (
              <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
                {STEPS.map((s, i) => (
                  <div
                    key={s}
                    className={`flex items-center gap-2 text-sm ${
                      i <= step ? "text-foreground" : "text-muted-foreground/50"
                    }`}
                  >
                    {i < step ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : i === step ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <span className="size-4" />
                    )}
                    {s}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diagnosis</CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <p className="text-sm text-muted-foreground">
                Upload or snap a leaf photo and the analysis appears here with treatment steps.
              </p>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-semibold">{result.top.name}</h2>
                    <Badge
                      variant="outline"
                      className={SEVERITY_STYLE[result.severity] ?? ""}
                    >
                      {result.severity} severity
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Confidence</span>
                      <span className="font-semibold">
                        {(result.top.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={result.top.confidence * 100} />
                  </div>
                </div>

                {result.notes.length > 0 && (
                  <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <div className="space-y-1">
                      {result.notes.map((n) => (
                        <p key={n}>{n}</p>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Do this now
                  </h3>
                  <ul className="space-y-1.5 text-sm">
                    {result.remediation.map((r) => (
                      <li key={r} className="flex gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Prevent it next season
                  </h3>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {result.preventive.map((r) => (
                      <li key={r} className="flex gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-soil" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid gap-4 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-2">
                  <div>
                    <h4 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      Feature vector
                    </h4>
                    <dl className="space-y-1 font-mono text-xs">
                      {(
                        [
                          ["chlorosis", result.features.chlorosis],
                          ["necrosis", result.features.necrosis],
                          ["lesionDensity", result.features.lesionDensity],
                          ["greenness", result.features.greenness],
                          ["textureEnergy", result.features.textureEnergy],
                          ["leafCoverage", result.features.leafCoverage],
                        ] as [string, number][]
                      ).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd>{v.toFixed(3)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div>
                    <h4 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      Class probabilities
                    </h4>
                    <dl className="space-y-1 font-mono text-xs">
                      {result.ranked.slice(0, 4).map((m) => (
                        <div key={m.id} className="flex justify-between gap-4">
                          <dt className="truncate text-muted-foreground">{m.name}</dt>
                          <dd>{(m.confidence * 100).toFixed(1)}%</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
