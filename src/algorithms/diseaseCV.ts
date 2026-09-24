/**
 * diseaseCV.ts — Leaf disease detection pipeline.
 *
 * Pure, UI-free implementation of the vision pipeline:
 *   1. Pixel sampling + RGB -> HSV conversion
 *   2. Leaf-mask segmentation (drops background pixels)
 *   3. Feature extraction (chlorosis, necrosis, lesion density, texture energy)
 *   4. Weighted distance scoring against a disease signature matrix
 *   5. Softmax-style confidence normalisation + severity banding
 */

export type Severity = "Low" | "Medium" | "High";

export interface LeafFeatures {
  /** Fraction of leaf pixels in the yellow hue band (chlorosis). */
  chlorosis: number;
  /** Fraction of very dark / brown low-value pixels (necrosis). */
  necrosis: number;
  /** Fraction of distinctly off-green blobs (lesion density). */
  lesionDensity: number;
  /** Fraction of healthy green pixels. */
  greenness: number;
  /** Normalised local-contrast energy (texture roughness). */
  textureEnergy: number;
  /** Mean saturation of leaf pixels. */
  saturation: number;
  /** Share of the frame identified as leaf tissue. */
  leafCoverage: number;
}

export interface DiseaseSignature {
  id: string;
  name: string;
  crops: string[];
  /** Expected feature vector for this disease. */
  centroid: Pick<
    LeafFeatures,
    "chlorosis" | "necrosis" | "lesionDensity" | "greenness" | "textureEnergy"
  >;
  remediation: string[];
  preventive: string[];
}

export interface DiseaseMatch {
  id: string;
  name: string;
  confidence: number;
  distance: number;
}

export interface DiagnosisResult {
  features: LeafFeatures;
  top: DiseaseMatch;
  ranked: DiseaseMatch[];
  severity: Severity;
  severityScore: number;
  remediation: string[];
  preventive: string[];
  usableImage: boolean;
  notes: string[];
}

/** Feature weights used in the weighted Euclidean distance. */
export const FEATURE_WEIGHTS = {
  chlorosis: 1.35,
  necrosis: 1.5,
  lesionDensity: 1.2,
  greenness: 0.9,
  textureEnergy: 0.7,
} as const;

/** Severity banding thresholds applied to the composite damage index. */
export const SEVERITY_THRESHOLDS = { low: 0.18, medium: 0.38 } as const;

/** Temperature of the softmax used to turn distances into confidences. */
export const SOFTMAX_TEMPERATURE = 0.12;

/** Minimum leaf coverage before the frame is considered analysable. */
export const MIN_LEAF_COVERAGE = 0.08;

export const DISEASE_SIGNATURES: DiseaseSignature[] = [
  {
    id: "healthy",
    name: "Healthy leaf tissue",
    crops: ["All crops"],
    centroid: {
      chlorosis: 0.04,
      necrosis: 0.02,
      lesionDensity: 0.03,
      greenness: 0.88,
      textureEnergy: 0.18,
    },
    remediation: [
      "No treatment required — canopy is within healthy limits.",
      "Continue the scouting routine twice per week.",
    ],
    preventive: [
      "Maintain balanced nitrogen so the canopy does not become disease-prone.",
      "Keep field sanitation: remove volunteer plants and crop debris.",
    ],
  },
  {
    id: "nitrogen_deficiency",
    name: "Nitrogen deficiency (abiotic)",
    crops: ["Wheat", "Rice", "Maize", "Cotton"],
    centroid: {
      chlorosis: 0.55,
      necrosis: 0.05,
      lesionDensity: 0.06,
      greenness: 0.38,
      textureEnergy: 0.2,
    },
    remediation: [
      "Apply a corrective top-dress of 25–30 kg N/ha as urea.",
      "Follow with light irrigation within 24 h so nitrogen reaches the root zone.",
      "Re-assess leaf colour after 10–12 days.",
    ],
    preventive: [
      "Split nitrogen into 3 doses matched to growth stage.",
      "Use a leaf colour chart weekly during vegetative growth.",
    ],
  },
  {
    id: "early_blight",
    name: "Early blight (Alternaria solani)",
    crops: ["Tomato", "Potato", "Brinjal"],
    centroid: {
      chlorosis: 0.3,
      necrosis: 0.34,
      lesionDensity: 0.42,
      greenness: 0.4,
      textureEnergy: 0.62,
    },
    remediation: [
      "Remove and destroy severely affected lower leaves.",
      "Spray Mancozeb 75% WP at 2 g/L, repeat after 10 days if lesions spread.",
      "Avoid overhead irrigation; water at the base early in the day.",
    ],
    preventive: [
      "Rotate away from solanaceous crops for at least two seasons.",
      "Stake plants to improve canopy airflow.",
    ],
  },
  {
    id: "late_blight",
    name: "Late blight (Phytophthora infestans)",
    crops: ["Potato", "Tomato"],
    centroid: {
      chlorosis: 0.18,
      necrosis: 0.52,
      lesionDensity: 0.48,
      greenness: 0.3,
      textureEnergy: 0.55,
    },
    remediation: [
      "Act immediately — this pathogen can destroy a field in under a week.",
      "Spray Cymoxanil + Mancozeb at 3 g/L across the whole block.",
      "Destroy infected haulm; do not compost it near the field.",
    ],
    preventive: [
      "Plant certified disease-free seed tubers.",
      "Track humidity: sustained >90% RH with 10–20 °C is high risk.",
    ],
  },
  {
    id: "leaf_rust",
    name: "Leaf rust (Puccinia spp.)",
    crops: ["Wheat", "Maize", "Sugarcane"],
    centroid: {
      chlorosis: 0.34,
      necrosis: 0.2,
      lesionDensity: 0.56,
      greenness: 0.42,
      textureEnergy: 0.7,
    },
    remediation: [
      "Spray Propiconazole 25% EC at 1 mL/L at first pustule appearance.",
      "Repeat once after 15 days if pustules are still erupting.",
    ],
    preventive: [
      "Prefer rust-resistant varieties for the next sowing.",
      "Avoid late sowing, which extends the susceptible window.",
    ],
  },
  {
    id: "bacterial_leaf_blight",
    name: "Bacterial leaf blight (Xanthomonas oryzae)",
    crops: ["Rice"],
    centroid: {
      chlorosis: 0.46,
      necrosis: 0.36,
      lesionDensity: 0.3,
      greenness: 0.32,
      textureEnergy: 0.38,
    },
    remediation: [
      "Drain the field for 2–3 days to slow bacterial spread.",
      "Stop nitrogen top-dressing until symptoms stabilise.",
      "Spray Copper oxychloride 3 g/L + Streptocycline 100 ppm.",
    ],
    preventive: [
      "Avoid excess nitrogen and clipping of seedling tips at transplanting.",
      "Use resistant varieties in endemic blocks.",
    ],
  },
  {
    id: "powdery_mildew",
    name: "Powdery mildew (Erysiphe spp.)",
    crops: ["Grape", "Cucurbits", "Wheat", "Pea"],
    centroid: {
      chlorosis: 0.22,
      necrosis: 0.1,
      lesionDensity: 0.34,
      greenness: 0.5,
      textureEnergy: 0.8,
    },
    remediation: [
      "Dust wettable sulphur 80% WP at 2 g/L on a dry, non-sunny day.",
      "Prune dense shoots to open up the canopy.",
    ],
    preventive: [
      "Avoid dense planting; keep row spacing to recommendation.",
      "Monitor when days are dry and nights are humid.",
    ],
  },
];

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

/**
 * Step 1–3: sample pixels, segment leaf tissue and extract the feature vector.
 * `data` is RGBA as produced by CanvasRenderingContext2D.getImageData().
 */
export function extractLeafFeatures(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): LeafFeatures {
  let leaf = 0;
  let green = 0;
  let yellow = 0;
  let dark = 0;
  let lesion = 0;
  let satSum = 0;
  let energy = 0;
  let energySamples = 0;

  const valueAt = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) / 255;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const { h, s, v } = rgbToHsv(data[i]!, data[i + 1]!, data[i + 2]!);

      // Leaf mask: anything plant-coloured (green/yellow/brown) with enough body.
      const isPlant = (h >= 20 && h <= 170 && s > 0.12 && v > 0.08) || (h < 45 && s > 0.25 && v < 0.6);
      if (!isPlant) continue;
      leaf++;
      satSum += s;

      if (h >= 75 && h <= 160 && s > 0.25 && v > 0.2) green++;
      else if (h >= 35 && h < 75 && s > 0.3) yellow++;

      if (v < 0.32 && s > 0.15) dark++;
      if ((h < 40 && s > 0.3 && v < 0.55) || (h >= 35 && h < 70 && v > 0.45 && s > 0.45)) lesion++;

      if (x > 0 && y > 0 && x < width - 1 && y < height - 1 && (x + y) % 3 === 0) {
        const c = valueAt(x, y);
        const grad =
          Math.abs(c - valueAt(x - 1, y)) +
          Math.abs(c - valueAt(x + 1, y)) +
          Math.abs(c - valueAt(x, y - 1)) +
          Math.abs(c - valueAt(x, y + 1));
        energy += grad / 4;
        energySamples++;
      }
    }
  }

  const total = width * height;
  const denom = Math.max(leaf, 1);

  return {
    chlorosis: yellow / denom,
    necrosis: dark / denom,
    lesionDensity: lesion / denom,
    greenness: green / denom,
    textureEnergy: Math.min(1, (energySamples ? energy / energySamples : 0) * 6),
    saturation: satSum / denom,
    leafCoverage: leaf / total,
  };
}

/** Weighted Euclidean distance between the observed features and a signature. */
export function signatureDistance(features: LeafFeatures, sig: DiseaseSignature): number {
  let sum = 0;
  let weightSum = 0;
  (Object.keys(FEATURE_WEIGHTS) as (keyof typeof FEATURE_WEIGHTS)[]).forEach((k) => {
    const w = FEATURE_WEIGHTS[k];
    const diff = features[k] - sig.centroid[k];
    sum += w * diff * diff;
    weightSum += w;
  });
  return Math.sqrt(sum / weightSum);
}

/** Composite damage index -> severity band. */
export function severityFromFeatures(features: LeafFeatures): {
  severity: Severity;
  score: number;
} {
  const score = Math.min(
    1,
    0.45 * features.necrosis + 0.35 * features.lesionDensity + 0.2 * features.chlorosis,
  );
  const severity: Severity =
    score < SEVERITY_THRESHOLDS.low ? "Low" : score < SEVERITY_THRESHOLDS.medium ? "Medium" : "High";
  return { severity, score };
}

/** Full pipeline: features -> distances -> softmax confidence -> severity. */
export function diagnoseLeaf(features: LeafFeatures): DiagnosisResult {
  const distances = DISEASE_SIGNATURES.map((sig) => ({
    sig,
    distance: signatureDistance(features, sig),
  }));

  const exps = distances.map((d) => Math.exp(-d.distance / SOFTMAX_TEMPERATURE));
  const sumExp = exps.reduce((a, b) => a + b, 0) || 1;

  const ranked: DiseaseMatch[] = distances
    .map((d, i) => ({
      id: d.sig.id,
      name: d.sig.name,
      distance: d.distance,
      confidence: exps[i]! / sumExp,
    }))
    .sort((a, b) => b.confidence - a.confidence);

  const top = ranked[0]!;
  const topSig = DISEASE_SIGNATURES.find((s) => s.id === top.id)!;
  const { severity, score } = severityFromFeatures(features);

  const notes: string[] = [];
  const usableImage = features.leafCoverage >= MIN_LEAF_COVERAGE;
  if (!usableImage) {
    notes.push(
      "Only a small part of the frame looks like leaf tissue — move closer and fill the frame with one leaf.",
    );
  }
  if (top.confidence < 0.4) {
    notes.push("Confidence is moderate. Take a second photo in even, indirect daylight to confirm.");
  }

  return {
    features,
    top,
    ranked,
    severity: topSig.id === "healthy" ? "Low" : severity,
    severityScore: score,
    remediation: topSig.remediation,
    preventive: topSig.preventive,
    usableImage,
    notes,
  };
}

/** Machine-readable spec rendered by the Algorithm Inspector. */
export const DISEASE_CV_SPEC = {
  title: "Leaf disease detection pipeline",
  summary:
    "Colour-space segmentation and weighted signature matching over a 7-class disease matrix, with softmax confidence and a composite damage index for severity.",
  stages: [
    "Downscale frame to 256 px on the long edge and read RGBA pixels",
    "RGB → HSV conversion per pixel",
    "Leaf mask: h ∈ [20°,170°] ∧ s > 0.12 ∧ v > 0.08 (plus a brown-tissue branch)",
    "Feature extraction: chlorosis, necrosis, lesion density, greenness, texture energy",
    "Weighted Euclidean distance to each disease centroid",
    "Softmax over −distance/τ → confidence",
    "Composite damage index → severity band",
  ],
  formulas: [
    "d(x, c) = sqrt( Σᵢ wᵢ (xᵢ − cᵢ)² / Σᵢ wᵢ )",
    "P(class k) = exp(−d_k / τ) / Σⱼ exp(−d_j / τ),  τ = 0.12",
    "damage = 0.45·necrosis + 0.35·lesionDensity + 0.20·chlorosis",
    "severity = Low if damage < 0.18, Medium if < 0.38, else High",
    "textureEnergy = min(1, 6 · mean |∇I| over a 1-in-3 pixel lattice)",
  ],
  weights: FEATURE_WEIGHTS,
  thresholds: {
    ...SEVERITY_THRESHOLDS,
    softmaxTemperature: SOFTMAX_TEMPERATURE,
    minLeafCoverage: MIN_LEAF_COVERAGE,
  },
  classes: DISEASE_SIGNATURES.map((s) => s.name),
} as const;
