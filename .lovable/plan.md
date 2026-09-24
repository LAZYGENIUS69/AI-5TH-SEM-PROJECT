# AgriSense — Agentic Agritech Advisor

A single dashboard app for farmers and agronomists: leaf disease scanning, an AI agronomist chat with visible source retrieval, live weather-driven irrigation alerts, and a fertilizer dose calculator — plus an "Algorithm Inspector" tab that shows the maths behind every answer for judges.

## Pages

**Home dashboard** (`/`)
- Proactive alert ticker at the top, updating from the live forecast for the chosen location
- Cards: today's weather, irrigation recommendation, last scan result, quick links
- Location picker (search by place, or use my location)

**Crop Scanner** (`/scanner`)
- Upload or snap a leaf photo
- Shows the analysis steps running, then: disease name, confidence %, severity (Low/Medium/High), and remediation steps
- Analysis is done in-browser from the image's own colour/texture patterns, as the brief specifies

**Agronomist Chat** (`/chat`)
- Ask farming questions in plain language
- Before the answer, the app shows which guide passages it retrieved (source title, snippet, similarity score)
- Answers come from real AI, grounded in those passages
- One ongoing conversation saved in this browser; a "New conversation" button clears it

**Irrigation Planner** (`/irrigation`)
- Crop, soil type, area, last irrigation date
- 7-day plan with water volume per day, rain-delay flags, and the reasoning behind each decision

**Fertilizer Optimizer** (`/fertilizer`)
- Crop, growth stage, area, current soil N-P-K readings
- Output: deficit per nutrient, product dosage in kg/hectare, split application timing

**Algorithm Inspector** (`/algorithms`)
- Tabs for each engine, showing the actual formulas, scoring weights, thresholds, and rule trees in formatted code blocks with plain-language explanation beside them

## Look and feel

Earthy agronomy palette (deep field green, soil clay, harvest amber) on warm off-white, with a clear dark mode. Confident geometric headings paired with a highly readable body face. Data-dense cards, generous spacing, Lucide icons. Fully responsive; the scanner works with a phone camera.

## Technical notes

- Stack: TanStack Start, Tailwind v4 semantic tokens, shadcn UI.
- `src/algorithms/` holds the pure logic, no UI imports: `diseaseCV.ts`, `ragEngine.ts`, `weatherAdvisor.ts`, `fertilizerOptimizer.ts`. Each exports its rule constants and a `SPEC` object (formula strings, weights, thresholds) that the Algorithm Inspector renders directly, so the docs cannot drift from the code.
- `diseaseCV.ts`: canvas pixel sampling → HSV histogram, chlorosis/necrosis/lesion-density features → weighted scoring against a disease signature table → confidence and severity.
- `ragEngine.ts`: a bundled corpus of agricultural extension chunks (ICAR-style guidance), token-overlap + TF-IDF cosine scoring for retrieval; top chunks shown in the UI and passed to the model as grounded context.
- `weatherAdvisor.ts`: Hargreaves reference evapotranspiration, crop coefficient by stage, soil water-holding capacity, effective rainfall; rain-delay and heat-stress decision trees.
- `fertilizerOptimizer.ts`: crop/stage nutrient targets, soil-test deficit, recovery-efficiency adjustment, conversion to urea/DAP/MOP dosage, split schedule.
- Weather: Open-Meteo forecast + geocoding, no API key, called from a server route with caching.
- Chat: Lovable AI (requires enabling Lovable Cloud) via a streaming server route; retrieval runs server-side and the chosen sources stream back with the answer. Conversation persisted to browser storage.
- `src/services/` for the weather and AI client wrappers.
- Per-page titles and social preview metadata on every route.
