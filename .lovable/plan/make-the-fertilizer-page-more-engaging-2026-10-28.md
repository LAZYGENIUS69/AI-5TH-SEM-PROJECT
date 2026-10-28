# Make the Fertilizer page more engaging

The page today is a plain form plus three result cards and two tables. The plan adds visuals, comparisons and actionable outputs while keeping the same calculation (no changes to the dose maths).

## What you will see

1. **Nutrient balance chart** — a stacked bar per nutrient (N, P, K) showing soil supply + organic-carbon credit vs. stage target, with the gap highlighted. Replaces reading numbers from the table (table stays below, collapsed).
2. **Cost estimate** — editable price per bag (urea, DAP, MOP; sensible defaults in rupees, marked as editable defaults), giving bags needed (50 kg bags) and total cost for your area.
3. **Season timeline** — all four growth stages on one horizontal timeline with the dose for each stage, so the farmer sees the whole season, not just the selected stage. Clicking a stage selects it.
4. **"What if" sliders** — sliders for soil N, P, K and pH beside the number boxes; results update live, with a small "change vs. your soil test" indicator on each product.
5. **Soil health score card** — a simple traffic-light rating (low / medium / high) for N, P, K, organic carbon and pH, using the standard soil health card bands.
6. **Ask the Agronomist** button — sends the current plan to the chat (same as the Disease Detection page does).
7. **Print / download plan** — a clean printable summary of products, timing and warnings.

## Technical details

- New pure helpers in `src/algorithms/fertilizerOptimizer.ts`: `seasonPlan()` (runs `optimizeFertilizer` for every stage), `soilHealthRating()` with band constants, `estimateCost()`; add bands to `FERTILIZER_SPEC` so the Algorithm Inspector shows them.
- Chart built with recharts (already common in shadcn chart component) using `--chart-*` tokens; works in light and dark.
- Prices stored in localStorage alongside farm settings.
- Chat handoff via existing `/chat?q=` prefill.
- Print via `window.print()` with a print-only stylesheet section.
- Add bun tests for `soilHealthRating` bands and `estimateCost` bag rounding.
- Verify desktop and mobile in both themes with Playwright.
