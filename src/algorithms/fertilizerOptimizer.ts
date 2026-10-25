/**
 * fertilizerOptimizer.ts — NPK deficit balancing and dosage computation.
 *
 * Soil test (kg/ha available) is compared with a crop + stage nutrient target,
 * corrected for nutrient-use efficiency, and converted into straight-fertilizer
 * product quantities with a split application schedule.
 */

export type Nutrient = "N" | "P" | "K";

export interface CropNutrientTarget {
  id: string;
  name: string;
  /** Season-long crop removal + build-up requirement, kg/ha of elemental N-P-K. */
  seasonTarget: Record<Nutrient, number>;
}

export interface GrowthStage {
  id: string;
  name: string;
  /** Share of the season requirement expected at this stage. */
  share: Record<Nutrient, number>;
  timing: string;
}

export interface SoilTest {
  /** Available nutrient in kg/ha from the soil report. */
  N: number;
  P: number;
  K: number;
  /** Soil organic carbon %, used for the nitrogen mineralisation credit. */
  organicCarbon: number;
  pH: number;
}

export interface NutrientPlanRow {
  nutrient: Nutrient;
  target: number;
  available: number;
  credit: number;
  deficit: number;
  efficiency: number;
  appliedElemental: number;
}

export interface ProductDose {
  product: string;
  nutrientContent: string;
  kgPerHa: number;
  totalKg: number;
}

export interface FertilizerPlan {
  rows: NutrientPlanRow[];
  products: ProductDose[];
  splits: { label: string; timing: string; share: number; note: string }[];
  warnings: string[];
  areaHa: number;
}

/** Apparent nutrient recovery efficiency (fraction of applied nutrient taken up). */
export const NUTRIENT_USE_EFFICIENCY: Record<Nutrient, number> = {
  N: 0.45,
  P: 0.2,
  K: 0.6,
};

/** Nitrogen mineralised per 1% soil organic carbon over a season, kg/ha. */
export const SOC_NITROGEN_CREDIT = 20;

/** Phosphorus availability multiplier by soil pH band. */
export const PH_P_AVAILABILITY: { max: number; factor: number; label: string }[] = [
  { max: 5.5, factor: 0.6, label: "Strongly acidic — P is fixed by Fe/Al" },
  { max: 6.5, factor: 0.85, label: "Slightly acidic" },
  { max: 7.5, factor: 1.0, label: "Near neutral — optimum availability" },
  { max: 8.5, factor: 0.8, label: "Alkaline — P fixed as Ca-phosphate" },
  { max: 14, factor: 0.65, label: "Strongly alkaline / sodic" },
];

export const FERTILIZER_PRODUCTS = {
  urea: { name: "Urea", n: 0.46 },
  dap: { name: "DAP (18-46-0)", n: 0.18, p: 0.46 },
  mop: { name: "MOP (0-0-60)", k: 0.6 },
} as const;

export const CROP_TARGETS: CropNutrientTarget[] = [
  { id: "rice", name: "Rice (paddy)", seasonTarget: { N: 120, P: 60, K: 60 } },
  { id: "wheat", name: "Wheat", seasonTarget: { N: 120, P: 60, K: 40 } },
  { id: "maize", name: "Maize", seasonTarget: { N: 150, P: 75, K: 75 } },
  { id: "cotton", name: "Cotton", seasonTarget: { N: 100, P: 50, K: 50 } },
  { id: "sugarcane", name: "Sugarcane", seasonTarget: { N: 250, P: 115, K: 115 } },
  { id: "tomato", name: "Tomato", seasonTarget: { N: 100, P: 50, K: 50 } },
  { id: "potato", name: "Potato", seasonTarget: { N: 150, P: 80, K: 100 } },
  { id: "soybean", name: "Soybean", seasonTarget: { N: 30, P: 60, K: 40 } },
];

export const GROWTH_STAGES: GrowthStage[] = [
  {
    id: "basal",
    name: "Sowing / transplanting (basal)",
    share: { N: 0.4, P: 1.0, K: 0.5 },
    timing: "At sowing, placed 5 cm below and beside the seed",
  },
  {
    id: "vegetative",
    name: "Active vegetative growth",
    share: { N: 0.35, P: 0, K: 0.25 },
    timing: "20–30 days after sowing, followed by light irrigation",
  },
  {
    id: "reproductive",
    name: "Flowering / panicle initiation",
    share: { N: 0.25, P: 0, K: 0.25 },
    timing: "45–60 days after sowing, before flowering peaks",
  },
  {
    id: "maturity",
    name: "Grain filling / maturity",
    share: { N: 0.05, P: 0, K: 0.1 },
    timing: "Foliar only — avoid heavy soil application this late",
  },
];

const round = (v: number, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

export function phFactor(pH: number) {
  return PH_P_AVAILABILITY.find((b) => pH <= b.max) ?? PH_P_AVAILABILITY[PH_P_AVAILABILITY.length - 1]!;
}

export function optimizeFertilizer(input: {
  cropId: string;
  stageId: string;
  soil: SoilTest;
  areaHa: number;
}): FertilizerPlan {
  const crop = CROP_TARGETS.find((c) => c.id === input.cropId) ?? CROP_TARGETS[0]!;
  const stage = GROWTH_STAGES.find((s) => s.id === input.stageId) ?? GROWTH_STAGES[0]!;
  const areaHa = Math.max(0.01, input.areaHa);
  const warnings: string[] = [];
  const ph = phFactor(input.soil.pH);

  const rows: NutrientPlanRow[] = (["N", "P", "K"] as Nutrient[]).map((nutrient) => {
    const target = crop.seasonTarget[nutrient] * stage.share[nutrient];
    const credit =
      nutrient === "N" ? SOC_NITROGEN_CREDIT * input.soil.organicCarbon * stage.share.N : 0;
    const availabilityFactor = nutrient === "P" ? ph.factor : 1;
    const available = input.soil[nutrient] * availabilityFactor * stage.share[nutrient];
    const deficit = Math.max(0, target - available - credit);
    const efficiency = NUTRIENT_USE_EFFICIENCY[nutrient];
    return {
      nutrient,
      target: round(target),
      available: round(available),
      credit: round(credit),
      deficit: round(deficit),
      efficiency,
      appliedElemental: round(deficit / efficiency),
    };
  });

  const nNeed = rows[0]!.appliedElemental;
  const pNeed = rows[1]!.appliedElemental;
  const kNeed = rows[2]!.appliedElemental;

  // DAP first (it carries N as well), then urea makes up the remaining N.
  const dapKg = pNeed / FERTILIZER_PRODUCTS.dap.p;
  const nFromDap = dapKg * FERTILIZER_PRODUCTS.dap.n;
  const ureaKg = Math.max(0, (nNeed - nFromDap) / FERTILIZER_PRODUCTS.urea.n);
  const mopKg = kNeed / FERTILIZER_PRODUCTS.mop.k;

  if (nFromDap > nNeed && nNeed > 0) {
    warnings.push(
      "DAP alone already supplies the nitrogen needed at this stage — skip urea to avoid lodging risk.",
    );
  }
  if (input.soil.pH < 5.5) {
    warnings.push("Soil pH is below 5.5 — apply 2 t/ha agricultural lime before the next season.");
  }
  if (input.soil.pH > 8.5) {
    warnings.push("Strongly alkaline soil — prefer single super phosphate and add gypsum.");
  }
  if (input.soil.organicCarbon < 0.4) {
    warnings.push("Organic carbon is low — incorporate 5 t/ha FYM or compost to rebuild the soil.");
  }

  const products: ProductDose[] = [
    { product: FERTILIZER_PRODUCTS.urea.name, nutrientContent: "46% N", kgPerHa: round(ureaKg) },
    { product: FERTILIZER_PRODUCTS.dap.name, nutrientContent: "18% N, 46% P₂O₅", kgPerHa: round(dapKg) },
    { product: FERTILIZER_PRODUCTS.mop.name, nutrientContent: "60% K₂O", kgPerHa: round(mopKg) },
  ]
    .filter((p) => p.kgPerHa > 0.5)
    .map((p) => ({ ...p, totalKg: round(p.kgPerHa * areaHa) }));

  const splits =
    nNeed > 60
      ? [
          {
            label: "First split — 50%",
            timing: stage.timing,
            share: 0.5,
            note: "Apply with adequate soil moisture, then irrigate lightly.",
          },
          {
            label: "Second split — 30%",
            timing: "12–15 days after the first split",
            share: 0.3,
            note: "Band beside the row; avoid contact with wet foliage.",
          },
          {
            label: "Third split — 20%",
            timing: "25–30 days after the first split",
            share: 0.2,
            note: "Skip this split if the leaf colour chart reads 4 or above.",
          },
        ]
      : [
          {
            label: "Single application — 100%",
            timing: stage.timing,
            share: 1,
            note: "Dose is small enough that splitting gives no measurable benefit.",
          },
        ];

  return { rows, products, splits, warnings, areaHa };
}

export const FERTILIZER_SPEC = {
  title: "NPK deficit optimiser",
  summary:
    "Stage-weighted crop requirement minus plant-available soil supply and mineralisation credit, divided by apparent recovery efficiency, then converted to straight fertilizer products.",
  formulas: [
    {
      label: "Stage target",
      latex: "T=R_{season}\\cdot s_{stage}",
      symbols: [
        { symbol: "R_season", meaning: "Season-long crop requirement", value: "kg/ha elemental" },
        { symbol: "s_stage", meaning: "Share of the season need due at this stage" },
      ],
    },
    {
      label: "Nitrogen mineralisation credit",
      latex: `C_N=${SOC_NITROGEN_CREDIT}\\cdot \\mathrm{SOC}\\%\\cdot s_{stage}`,
      symbols: [
        { symbol: "SOC%", meaning: "Soil organic carbon", value: "%" },
        { symbol: String(SOC_NITROGEN_CREDIT), meaning: "kg N/ha mineralised per 1% SOC over a season" },
      ],
    },
    {
      label: "Plant-available soil supply",
      latex: "A_i=\\mathrm{soilTest}_i\\cdot f_i\\cdot s_{stage}",
      symbols: [
        { symbol: "f_i", meaning: "Availability factor (pH-dependent for P, else 1)" },
      ],
    },
    {
      label: "Deficit",
      latex: "\\Delta=\\max(0,\\,T-A-C)",
      symbols: [
        { symbol: "T, A, C", meaning: "Target, available supply, credit", value: "kg/ha" },
      ],
    },
    {
      label: "Elemental quantity to apply",
      latex: `U=\\Delta/\\eta,\\quad \\eta_N=${NUTRIENT_USE_EFFICIENCY.N},\\ \\eta_P=${NUTRIENT_USE_EFFICIENCY.P},\\ \\eta_K=${NUTRIENT_USE_EFFICIENCY.K}`,
      symbols: [
        { symbol: "η", meaning: "Apparent recovery efficiency", value: `N ${NUTRIENT_USE_EFFICIENCY.N} · P ${NUTRIENT_USE_EFFICIENCY.P} · K ${NUTRIENT_USE_EFFICIENCY.K}` },
      ],
    },
    {
      label: "Product conversion",
      latex: `\\mathrm{DAP}=U_P/${FERTILIZER_PRODUCTS.dap.p},\\quad \\mathrm{Urea}=\\max\\big(0,\\,U_N-${FERTILIZER_PRODUCTS.dap.n}\\cdot \\mathrm{DAP}\\big)/${FERTILIZER_PRODUCTS.urea.n},\\quad \\mathrm{MOP}=U_K/${FERTILIZER_PRODUCTS.mop.k}`,
      symbols: [
        { symbol: "0.46 / 0.18 / 0.60", meaning: "Nutrient content of urea (N), DAP (N and P), MOP (K)" },
      ],
    },
  ],
  phTable: PH_P_AVAILABILITY,
  weights: NUTRIENT_USE_EFFICIENCY,
  thresholds: {
    socNitrogenCredit: SOC_NITROGEN_CREDIT,
    splitThresholdKgN: 60,
    limeBelowPh: 5.5,
    gypsumAbovePh: 8.5,
  },
  stages: GROWTH_STAGES.map((s) => `${s.name}: N ${s.share.N}, P ${s.share.P}, K ${s.share.K}`),
} as const;
