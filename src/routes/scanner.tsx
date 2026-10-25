import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageUp, Loader2, ShieldAlert, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { ModelEvaluation } from "@/components/scanner/ModelEvaluation";
import {
  LOW_CONFIDENCE_THRESHOLD,
  matchRemediation,
  topPredictions,
  type CnnPrediction,
} from "@/algorithms/cnnClassifier";
import {
  diagnoseLeaf,
  extractLeafFeatures,
  type DiagnosisResult,
} from "@/algorithms/diseaseCV";

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "Disease Detection — leaf disease diagnosis | AgriSense" },
      {
        name: "description",
        content:
          "Photograph a crop leaf and get a disease name, confidence score, severity rating and remediation steps.",
      },
      {
        property: "og:title",
        content: "Disease Detection — leaf disease diagnosis",
      },
      {
        property: "og:description",
        content: "Leaf photo in, disease name, severity and treatment steps out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

const CNN_STEPS = [
  "Resizing frame to 224×224",
  "Building raw RGB tensor [1,224,224,3]",
  "Running MobileNetV2 forward pass",
  "Ranking top-3 PlantVillage classes",
];

const SEVERITY_STYLE: Record<string, string> = {
  Low: "bg-success-soft text-success-soft-foreground border-success-border",
  Medium: "bg-warning-soft text-warning-soft-foreground border-warning-border",
  High: "bg-danger-soft text-danger-soft-foreground border-danger-border",
};

type Engine = "cnn" | "heuristic";
type ModelState = "loading" | "ready" | "error";

function Scanner() {
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [cnn, setCnn] = useState<CnnPrediction[] | null>(null);
  const [engine, setEngine] = useState<Engine>("cnn");
  const [modelState, setModelState] = useState<ModelState>("loading");
  const [modelError, setModelError] = useState("");
  const [modelLoadTime, setModelLoadTime] = useState<number | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [scanError, setScanError] = useState("");
  const [step, setStep] = useState(-1);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let alive = true;
    setModelState("loading");
    setModelError("");
    import("@/lib/cnnModel")
      .then((m) => m.loadCnn())
      .then((loaded) => {
        if (!alive) return;
        setModelLoadTime(loaded.loadTimeMs);
        setModelState("ready");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setModelState("error");
        setModelError(e instanceof Error ? e.message : "Model failed to load");
        setEngine("heuristic");
      });
    return () => {
      alive = false;
    };
  }, [loadAttempt]);

  const saveScan = (entry: Record<string, unknown>) => {
    try {
      window.localStorage.setItem(
        "agrisense.lastScan",
        JSON.stringify({ ...entry, at: new Date().toISOString() }),
      );
    } catch {
      /* ignore */
    }
  };

  const runCnn = useCallback(async (img: HTMLImageElement, heur: DiagnosisResult) => {
    const m = await import("@/lib/cnnModel");
    const { scores, labels } = await m.classifyCanvas(img);
    const top = topPredictions(scores, labels);
    setCnn(top);
    const best = top[0];
    if (best)
      saveScan({
        crop: best.crop,
        disease: best.healthy ? "Healthy" : best.disease,
        confidence: best.confidence,
        severity: best.healthy ? "Low" : heur.severity,
        engine: "CNN (MobileNetV2)",
      });
  }, []);

  const analyse = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Please choose a JPG, PNG or WebP photo.");
        return;
      }
      setResult(null);
      setCnn(null);
      setScanError("");
      const url = URL.createObjectURL(file);
      setPreview(url);

      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        toast.error("That file could not be read as an image.");
        return;
      }
      imgRef.current = img;

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

      const steps = engine === "cnn" ? CNN_STEPS : STEPS;
      for (let i = 0; i < steps.length; i++) {
        setStep(i);
        await new Promise((r) => setTimeout(r, 200));
      }

      const { data } = ctx.getImageData(0, 0, w, h);
      const diagnosis = diagnoseLeaf(extractLeafFeatures(data, w, h));
      setResult(diagnosis);

      if (engine === "cnn" && modelState === "ready") {
        try {
          await runCnn(img, diagnosis);
        } catch (error: unknown) {
          setScanError(error instanceof Error ? error.message : String(error));
          toast.error("The CNN could not classify this image — showing the baseline.");
          setEngine("heuristic");
          saveScan({ disease: diagnosis.top.name, confidence: diagnosis.top.confidence, severity: diagnosis.severity, engine: "Heuristic baseline" });
        }
      } else {
        saveScan({
          disease: diagnosis.top.name,
          confidence: diagnosis.top.confidence,
          severity: diagnosis.severity,
          engine: "Heuristic baseline",
        });
      }
      setStep(-1);
    },
    [engine, modelState, runCnn],
  );

  const switchEngine = async (next: Engine) => {
    if (next === "cnn" && modelState !== "ready") return;
    setEngine(next);
    if (next === "cnn" && imgRef.current && result) {
      try {
        await runCnn(imgRef.current, result);
        setScanError("");
      } catch (error: unknown) {
        setScanError(error instanceof Error ? error.message : String(error));
        setEngine("heuristic");
        toast.error("The CNN could not classify this image.");
      }
    } else if (next === "heuristic" && result) {
      saveScan({
        disease: result.top.name,
        confidence: result.top.confidence,
        severity: result.severity,
        engine: "Heuristic baseline",
      });
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void analyse(file);
    e.target.value = "";
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) void analyse(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [analyse]);

  const steps = engine === "cnn" ? CNN_STEPS : STEPS;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Disease detection</h1>
        <p className="text-sm text-muted-foreground">
          Fill the frame with one leaf in even daylight for the most reliable reading.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Engine:</span>
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          <Button
            size="sm"
            variant={engine === "cnn" ? "default" : "ghost"}
            disabled={modelState !== "ready"}
            onClick={() => void switchEngine("cnn")}
          >
            {modelState === "loading" && <Loader2 className="size-3 animate-spin" />}
            CNN (MobileNetV2)
          </Button>
          <Button
            size="sm"
            variant={engine === "heuristic" ? "default" : "ghost"}
            onClick={() => void switchEngine("heuristic")}
          >
            Heuristic baseline
          </Button>
        </div>
        {modelState === "loading" && (
          <span className="text-xs text-muted-foreground">Downloading model…</span>
        )}
        <Badge variant="outline" className={`max-w-full whitespace-normal break-words ${modelState === "ready" ? SEVERITY_STYLE.Low : modelState === "error" ? SEVERITY_STYLE.High : ""}`}>
          Model status: {modelState === "ready" ? `Loaded (${((modelLoadTime ?? 0) / 1000).toFixed(2)} s)` : modelState === "error" ? `Failed — ${modelError}` : "Loading"}
        </Badge>
        {modelState === "error" && <Button size="sm" variant="secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry model</Button>}
      </div>

      {modelState === "error" && (
        <div className="flex gap-2 rounded-xl border border-warning-border bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 break-words">
            CNN model unavailable ({modelError}). Using the rule-based heuristic baseline
            automatically — its accuracy is unmeasured.
          </p>
        </div>
      )}
      {scanError && <p role="alert" className="break-words text-sm text-destructive">CNN scan failed: {scanError}. Showing the heuristic baseline.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leaf image</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void analyse(file);
              }}
              className={`field-grid flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/40 transition-colors ${
                dragging ? "border-primary bg-primary/10" : "border-border"
              }`}
            >
              {preview ? (
                <img src={preview} alt="Leaf to analyse" className="size-full object-cover" />
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Sprout className="mx-auto mb-2 size-8 text-primary/60" />
                  Drag a leaf photo here, paste it (Ctrl+V), or click to browse
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                hidden
                onChange={onPick}
              />
              <input
                ref={cameraRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
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
                {steps.map((s, i) => (
                  <div
                    key={s}
                    className={`flex items-center gap-2 text-sm ${
                      i <= step ? "text-foreground" : "text-muted-foreground"
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
            {result && engine === "cnn" && cnn ? (
              <CnnResult preds={cnn} coverageNotes={result.notes} />
            ) : !result ? (
              <p className="text-sm text-muted-foreground">
                Upload or snap a leaf photo and the analysis appears here with treatment steps.
              </p>
            ) : (
              <div className="space-y-5">
                <p className="text-xs text-muted-foreground">
                  Heuristic: rule-based baseline, unmeasured accuracy.
                </p>
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
                  <div className="flex gap-2 rounded-lg border border-warning-border bg-warning-soft p-3 text-sm text-warning-soft-foreground">
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

      <ModelEvaluation />
    </div>
  );
}

function CnnResult({ preds, coverageNotes }: { preds: CnnPrediction[]; coverageNotes: string[] }) {
  const top = preds[0];
  if (!top) return null;
  const card = matchRemediation(top);
  const low = top.confidence < LOW_CONFIDENCE_THRESHOLD;
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">CNN (MobileNetV2) · PlantVillage 38 classes</p>
      <div>
        <p className="text-sm text-muted-foreground">{top.crop}</p>
        <h2 className={`font-display text-xl font-semibold ${top.healthy ? "text-success" : ""}`}>
          {top.healthy ? "Healthy" : top.disease}
        </h2>
      </div>
      <div className="space-y-3">
        {preds.map((p) => (
          <div key={p.label} className="space-y-1">
            <div className="flex justify-between gap-3 text-sm">
              <span className={`min-w-0 truncate ${p.healthy ? "text-success" : ""}`}>
                {p.crop} · {p.healthy ? "Healthy" : p.disease}
              </span>
              <span className="font-mono">{(p.confidence * 100).toFixed(1)}%</span>
            </div>
            <Progress value={p.confidence * 100} />
          </div>
        ))}
      </div>
      {(low || coverageNotes.length > 0) && (
        <div className="flex gap-2 rounded-lg border border-warning-border bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            {low && <p>Low confidence - retake photo on a plain background.</p>}
            {coverageNotes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        </div>
      )}
      {card ? (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Do this now
            </h3>
            <ul className="space-y-1.5 text-sm">
              {card.remediation.map((r) => (
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
              {card.preventive.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-soil" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <p>
            No built-in treatment card for {top.crop} {top.disease}. Confirm with a local extension
            officer before spraying.
          </p>
        </div>
      )}
      {!top.healthy && (
        <Button asChild variant="secondary" className="gap-2">
          <Link to="/chat" search={{ q: `How do I manage ${top.crop} ${top.disease}?` }}>
            Ask Agronomist about this
          </Link>
        </Button>
      )}
    </div>
  );
}