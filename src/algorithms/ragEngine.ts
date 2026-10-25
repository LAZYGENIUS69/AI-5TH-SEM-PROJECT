/**
 * ragEngine.ts — Retrieval-augmented generation engine.
 *
 * Local vector index over an agricultural extension corpus:
 *   tokenise → stopword removal → term frequency → IDF weighting →
 *   L2-normalised sparse vectors → cosine similarity → MMR re-ranking.
 *
 * The index is built once, lazily, and reused. No network calls: retrieval is
 * fully deterministic so the retrieved evidence can be shown to the user
 * before the language model produces its answer.
 */

export interface CorpusChunk {
  id: string;
  source: string;
  section: string;
  crop: string;
  text: string;
}

export interface RetrievedChunk extends CorpusChunk {
  score: number;
  matchedTerms: string[];
}

export const STOPWORDS = new Set(
  "a an the is are was were be been being of for to in on at by with from as and or if then than that this these those it its my our your how what when which why do does did can could should would will shall i we you they he she them us me not no yes about into over under more most some any each per".split(
    " ",
  ),
);

/** Retrieval hyper-parameters. */
export const RETRIEVAL_CONFIG = {
  topK: 3,
  candidatePool: 8,
  /** Maximal Marginal Relevance trade-off: 1 = pure relevance, 0 = pure diversity. */
  mmrLambda: 0.72,
  /** Chunks below this cosine score are treated as irrelevant. */
  minScore: 0.06,
} as const;

export const CORPUS: CorpusChunk[] = [
  {
    id: "icar-rice-water-01",
    source: "ICAR Package of Practices — Rice",
    section: "Water management",
    crop: "Rice",
    text: "Continuous flooding is not necessary for rice. Alternate wetting and drying (AWD) keeps 2–5 cm of standing water during the first 15 days after transplanting, then allows the water to drop to 15 cm below the surface before re-flooding. AWD saves 15–30% irrigation water without yield loss and reduces methane emissions. Keep continuous shallow flooding only during panicle initiation to flowering, the most water-sensitive stage.",
  },
  {
    id: "icar-rice-blight-02",
    source: "ICAR Plant Protection Bulletin — Rice",
    section: "Bacterial leaf blight",
    crop: "Rice",
    text: "Bacterial leaf blight of rice, caused by Xanthomonas oryzae pv. oryzae, appears as water-soaked yellow lesions along leaf margins that turn straw-coloured. Excess nitrogen and standing water spread the bacterium. Drain the field for two to three days, stop nitrogen top-dressing, and spray copper oxychloride at 3 g per litre with streptocycline at 100 ppm. Use resistant varieties such as Improved Samba Mahsuri in endemic areas.",
  },
  {
    id: "icar-wheat-nutrient-03",
    source: "ICAR Package of Practices — Wheat",
    section: "Nutrient management",
    crop: "Wheat",
    text: "Irrigated wheat requires roughly 120 kg nitrogen, 60 kg phosphorus and 40 kg potassium per hectare. Apply the full phosphorus and potassium plus half the nitrogen as a basal dose at sowing. Top-dress the remaining nitrogen in two splits: at first irrigation (crown root initiation, 21 days after sowing) and at the late tillering stage. Late nitrogen after booting increases lodging without raising yield.",
  },
  {
    id: "icar-wheat-irrigation-04",
    source: "ICAR Package of Practices — Wheat",
    section: "Irrigation scheduling",
    crop: "Wheat",
    text: "Wheat has six critical irrigation stages: crown root initiation (20–25 days after sowing), tillering, late jointing, flowering, milk and dough stage. If only one irrigation is possible, apply it at crown root initiation, which alone can protect up to 40% of yield. Each irrigation should apply about 50–60 mm of water. Stop irrigation 10–15 days before harvest.",
  },
  {
    id: "icar-soil-health-05",
    source: "Soil Health Card Scheme — Interpretation Guide",
    section: "Soil test interpretation",
    crop: "All crops",
    text: "Available nitrogen below 280 kg per hectare is rated low, 280–560 medium and above 560 high. Available phosphorus below 10 kg per hectare is low, 10–25 medium, above 25 high. Available potassium below 108 kg per hectare is low, 108–280 medium, above 280 high. Organic carbon below 0.5% is low and calls for 5 tonnes per hectare of farmyard manure. Soil pH below 5.5 needs liming; above 8.5 indicates sodicity requiring gypsum.",
  },
  {
    id: "icar-tomato-blight-06",
    source: "ICAR Horticulture Advisory — Tomato",
    section: "Early and late blight",
    crop: "Tomato",
    text: "Early blight shows concentric dark rings on older leaves, while late blight produces greasy grey-green patches with white fungal growth on the underside during cool humid weather. For early blight spray mancozeb 75% WP at 2 g per litre. For late blight use cymoxanil plus mancozeb at 3 g per litre immediately, as the disease can destroy a field within a week under humidity above 90% and temperatures of 10–20 degrees Celsius. Stake plants and avoid overhead irrigation.",
  },
  {
    id: "icar-ipm-07",
    source: "National IPM Guidelines",
    section: "Integrated pest management",
    crop: "All crops",
    text: "Integrated pest management follows a sequence: cultural control through crop rotation and resistant varieties, mechanical control with pheromone traps at 5 per hectare and light traps, biological control using Trichogramma and neem-based formulations at 5 ml per litre, and chemical control only when pest counts cross the economic threshold level. Rotate insecticide modes of action every season to delay resistance. Never spray during flowering hours when pollinators are active.",
  },
  {
    id: "icar-cotton-bollworm-08",
    source: "ICAR Package of Practices — Cotton",
    section: "Pink bollworm management",
    crop: "Cotton",
    text: "Pink bollworm is monitored with pheromone traps at 5 per hectare from 45 days after sowing. The economic threshold is 8 moths per trap per night for three consecutive nights, or 10% rosette flowers. Remove and destroy rosette flowers and affected bolls. Terminate the crop by the end of the season and avoid extending it, which breaks the pest carry-over cycle. Avoid pyrethroids before 120 days as they trigger whitefly outbreaks.",
  },
  {
    id: "icar-maize-09",
    source: "ICAR Package of Practices — Maize",
    section: "Fall armyworm",
    crop: "Maize",
    text: "Fall armyworm damages maize whorls, producing ragged holes and moist sawdust-like frass. Apply sand mixed with lime into the whorl at early infestation, use pheromone traps at 10 per hectare, and release Trichogramma pretiosum. Where damage exceeds 10% of plants, spray emamectin benzoate 5% SG at 0.4 g per litre or spinetoram 11.7% SC at 0.5 ml per litre, directing the spray into the whorl in the early morning or evening.",
  },
  {
    id: "icar-drip-10",
    source: "Per Drop More Crop — Micro Irrigation Manual",
    section: "Drip and sprinkler design",
    crop: "All crops",
    text: "Drip irrigation raises water use efficiency to 85–95% against 35–50% for surface flooding. Emitter discharge of 4 litres per hour with a lateral spacing matched to row spacing suits most row crops. Run the system to replace the crop evapotranspiration of the previous day rather than on a fixed clock. Flush laterals weekly and inject acid periodically to clear emitter clogging. Fertigation through drip cuts fertilizer use by 20–30%.",
  },
  {
    id: "icar-organic-11",
    source: "Paramparagat Krishi Vikas Yojana — Organic Practices",
    section: "Organic nutrient sources",
    crop: "All crops",
    text: "Farmyard manure supplies roughly 0.5% nitrogen, 0.2% phosphorus and 0.5% potassium; 10 tonnes therefore delivers about 50 kg nitrogen per hectare, released slowly across the season. Vermicompost is richer at about 1.5% nitrogen. Green manuring with dhaincha or sunhemp incorporated at 45 days adds 60–80 kg nitrogen per hectare. Biofertilizers such as Azospirillum and phosphate solubilising bacteria applied as a seed treatment at 20 g per kg of seed reduce mineral fertilizer needs by around 25%.",
  },
  {
    id: "icar-weather-12",
    source: "Agromet Advisory Service — Farmer Bulletin",
    section: "Weather-based advisories",
    crop: "All crops",
    text: "Do not apply urea or foliar sprays when more than 10 mm of rainfall is forecast within 24 hours, as nutrients and pesticide are washed away. Avoid spraying when wind speed exceeds 20 kilometres per hour because drift wastes chemical and harms neighbouring fields. During heat waves above 38 degrees Celsius, irrigate at night, apply potassium as a foliar spray at 1% to improve stress tolerance, and mulch the root zone. Before a frost night, a light evening irrigation keeps the canopy warmer.",
  },
  {
    id: "icar-storage-13",
    source: "Post-Harvest Handling Manual",
    section: "Grain storage",
    crop: "All crops",
    text: "Dry grain to 12% moisture or below before storage; above 14% moisture fungal growth and aflatoxin risk rise sharply. Clean and fumigate the storage structure before filling. Use hermetic storage bags for small lots. Stack bags on wooden pallets 15 cm above the floor and 50 cm from walls for air circulation. Inspect monthly for insect activity and use aluminium phosphide fumigation only in sealed structures and only by trained personnel.",
  },
  {
    id: "icar-potato-14",
    source: "ICAR Package of Practices — Potato",
    section: "Nutrient and irrigation",
    crop: "Potato",
    text: "Potato needs about 150 kg nitrogen, 80 kg phosphorus and 100 kg potassium per hectare. Apply half the nitrogen and all phosphorus and potassium at planting, with the remaining nitrogen at earthing up, 30 days after planting. Keep soil moisture between 60 and 80% of field capacity; potato is shallow rooted and highly sensitive to water stress during stolon formation and tuber bulking. Stop irrigation 10 days before harvest to firm the skin.",
  },
  {
    id: "icar-soybean-15",
    source: "ICAR Package of Practices — Soybean",
    section: "Nutrition and rhizobium",
    crop: "Soybean",
    text: "Soybean fixes most of its own nitrogen, so only a starter dose of about 30 kg nitrogen per hectare is needed along with 60 kg phosphorus and 40 kg potassium. Treat seed with Bradyrhizobium japonicum at 5 g per kg of seed plus phosphate solubilising bacteria. Sulphur at 20 kg per hectare markedly raises oil content. Avoid waterlogging: soybean roots suffer within 48 hours of standing water, so ensure the field drains after heavy rain.",
  },
];

// ---------------------------------------------------------------------------
// Vector index
// ---------------------------------------------------------------------------

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s%.-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

type SparseVector = Map<string, number>;

interface VectorIndex {
  idf: Map<string, number>;
  vectors: { chunk: CorpusChunk; vector: SparseVector }[];
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  tokens.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
  return tf;
}

function l2Normalize(vec: SparseVector): SparseVector {
  let norm = 0;
  vec.forEach((v) => (norm += v * v));
  norm = Math.sqrt(norm) || 1;
  const out: SparseVector = new Map();
  vec.forEach((v, k) => out.set(k, v / norm));
  return out;
}

export function cosineSimilarity(a: SparseVector, b: SparseVector): number {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  small.forEach((v, k) => {
    const other = large.get(k);
    if (other) dot += v * other;
  });
  return dot;
}

let cachedIndex: VectorIndex | null = null;

export function buildIndex(corpus: CorpusChunk[] = CORPUS): VectorIndex {
  const docTokens = corpus.map((c) => tokenize(`${c.crop} ${c.section} ${c.text}`));
  const df = new Map<string, number>();
  docTokens.forEach((tokens) => {
    new Set(tokens).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1));
  });

  const N = corpus.length;
  const idf = new Map<string, number>();
  df.forEach((count, term) => idf.set(term, Math.log((N + 1) / (count + 0.5)) + 1));

  const vectors = corpus.map((chunk, i) => {
    const tf = termFrequency(docTokens[i]!);
    const vec: SparseVector = new Map();
    tf.forEach((count, term) => {
      // Sub-linear tf scaling damps repeated terms.
      vec.set(term, (1 + Math.log(count)) * (idf.get(term) ?? 1));
    });
    return { chunk, vector: l2Normalize(vec) };
  });

  return { idf, vectors };
}

export function getIndex(): VectorIndex {
  cachedIndex ??= buildIndex();
  return cachedIndex;
}

export function embedQuery(query: string, index: VectorIndex): SparseVector {
  const tf = termFrequency(tokenize(query));
  const vec: SparseVector = new Map();
  tf.forEach((count, term) => {
    vec.set(term, (1 + Math.log(count)) * (index.idf.get(term) ?? 1));
  });
  return l2Normalize(vec);
}

/**
 * Retrieve the most relevant chunks using cosine similarity followed by
 * Maximal Marginal Relevance re-ranking so the shown evidence is not redundant.
 */
export function retrieve(
  query: string,
  options?: { topK?: number },
): { results: RetrievedChunk[]; queryTerms: string[] } {
  const index = getIndex();
  const topK = options?.topK ?? RETRIEVAL_CONFIG.topK;
  const qVec = embedQuery(query, index);
  const queryTerms = Array.from(qVec.keys());

  const scored = index.vectors
    .map(({ chunk, vector }) => ({
      chunk,
      vector,
      score: cosineSimilarity(qVec, vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, RETRIEVAL_CONFIG.candidatePool)
    .filter((c) => c.score >= RETRIEVAL_CONFIG.minScore);

  // MMR selection
  const selected: typeof scored = [];
  while (selected.length < topK && scored.length > 0) {
    let bestIdx = 0;
    let bestValue = -Infinity;
    scored.forEach((cand, i) => {
      const maxSim = selected.reduce(
        (m, s) => Math.max(m, cosineSimilarity(cand.vector, s.vector)),
        0,
      );
      const value =
        RETRIEVAL_CONFIG.mmrLambda * cand.score - (1 - RETRIEVAL_CONFIG.mmrLambda) * maxSim;
      if (value > bestValue) {
        bestValue = value;
        bestIdx = i;
      }
    });
    selected.push(scored.splice(bestIdx, 1)[0]!);
  }

  const results: RetrievedChunk[] = selected.map(({ chunk, vector, score }) => ({
    ...chunk,
    score: Math.round(score * 1000) / 1000,
    matchedTerms: queryTerms.filter((t) => vector.has(t)).slice(0, 8),
  }));

  return { results, queryTerms };
}

/** Compose the grounded context block handed to the language model. */
export function buildContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "No indexed passage matched this question.";
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.source} — ${c.section} (crop: ${c.crop}, similarity ${c.score})\n${c.text}`,
    )
    .join("\n\n");
}

export const AGRONOMIST_SYSTEM_PROMPT = `You are AgriSense, an agronomy advisor for Indian farmers and field agronomists.

Rules:
- Answer using the RETRIEVED CONTEXT as your primary evidence. Cite it inline as [1], [2] matching the numbered passages.
- If the context does not cover the question, say so plainly in one line, then give careful general agronomic guidance clearly marked as general advice.
- Be practical and specific: give rates (kg/ha, g/L), timing, and the observable signs to check.
- Keep answers under 220 words. Use short paragraphs or tight bullet lists.
- Use simple language a farmer can act on. Metric units only.
- Never invent chemical names, brand names, or government scheme details.`;

export const RAG_SPEC = {
  title: "Retrieval-augmented generation engine",
  summary:
    "TF-IDF sparse vector index over an agricultural extension corpus, cosine retrieval, MMR re-ranking for non-redundant evidence, then grounded generation with inline citations.",
  limitations:
    "The corpus is 15 short hand-written passages in an ICAR-style tone, not verbatim official documents. Verify rates before acting.",
  formulas: [
    {
      label: "Term frequency (sub-linear)",
      latex: "\\mathrm{tf}(t,d)=1+\\log\\big(\\mathrm{count}(t,d)\\big)",
      symbols: [
        { symbol: "count(t,d)", meaning: "Occurrences of term t in chunk d" },
      ],
    },
    {
      label: "Inverse document frequency (smoothed)",
      latex: "\\mathrm{idf}(t)=\\log\\!\\dfrac{N+1}{\\mathrm{df}(t)+0.5}+1",
      symbols: [
        { symbol: "N", meaning: "Chunks in the corpus", value: String(CORPUS.length) },
        { symbol: "df(t)", meaning: "Chunks containing term t" },
      ],
    },
    {
      label: "Vector weight + normalisation",
      latex: "w(t,d)=\\mathrm{tf}(t,d)\\cdot\\mathrm{idf}(t),\\qquad \\hat{\\mathbf d}=\\dfrac{\\mathbf d}{\\lVert\\mathbf d\\rVert_2}",
      symbols: [
        { symbol: "d̂", meaning: "Unit-length chunk vector" },
      ],
    },
    {
      label: "Cosine similarity",
      latex: "\\cos(\\mathbf q,\\mathbf d)=\\dfrac{\\mathbf q\\cdot\\mathbf d}{\\lVert\\mathbf q\\rVert\\,\\lVert\\mathbf d\\rVert}=\\hat{\\mathbf q}\\cdot\\hat{\\mathbf d}",
      symbols: [
        { symbol: "q", meaning: "Query vector" },
        { symbol: "d", meaning: "Chunk vector" },
      ],
    },
    {
      label: "MMR re-ranking",
      latex: `\\mathrm{MMR}=\\arg\\max_{d\\in R\\setminus S}\\Big[\\lambda\\,\\mathrm{sim}(d,q)-(1-\\lambda)\\max_{d'\\in S}\\mathrm{sim}(d,d')\\Big],\\quad \\lambda=${RETRIEVAL_CONFIG.mmrLambda}`,
      symbols: [
        { symbol: "λ", meaning: "Relevance vs diversity trade-off", value: String(RETRIEVAL_CONFIG.mmrLambda) },
        { symbol: "R ∖ S", meaning: "Candidates not yet selected" },
      ],
    },
  ],
  pipeline: [
    "Tokenise + stopword removal (lowercase, ≥3 chars)",
    "Build IDF over the corpus, embed each chunk, L2-normalise",
    "Embed the query in the same space",
    `Cosine scoring → top ${RETRIEVAL_CONFIG.candidatePool} candidate pool, drop score < ${RETRIEVAL_CONFIG.minScore}`,
    `MMR re-rank → top ${RETRIEVAL_CONFIG.topK} passages shown to the user`,
    "Passages injected as numbered context into the model prompt",
  ],
  thresholds: RETRIEVAL_CONFIG,
  corpusSize: CORPUS.length,
} as const;
