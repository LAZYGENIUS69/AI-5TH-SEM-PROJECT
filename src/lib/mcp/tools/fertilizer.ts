import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { CROP_TARGETS, GROWTH_STAGES, optimizeFertilizer } from "@/algorithms/fertilizerOptimizer";

export default defineTool({
  name: "plan_fertilizer",
  title: "Plan fertilizer doses",
  description: "Turn a soil test into urea, DAP and MOP quantities for a crop, growth stage and area.",
  inputSchema: {
    cropId: z.enum(CROP_TARGETS.map((c) => c.id) as [string, ...string[]]).describe("Crop id."),
    stageId: z.enum(GROWTH_STAGES.map((s) => s.id) as [string, ...string[]]).describe("Growth stage id."),
    areaHa: z.number().min(0.01).max(10000).describe("Field area in hectares."),
    N: z.number().min(0).max(2000).describe("Available soil N, kg/ha."),
    P: z.number().min(0).max(2000).describe("Available soil P, kg/ha."),
    K: z.number().min(0).max(2000).describe("Available soil K, kg/ha."),
    organicCarbon: z.number().min(0).max(10).describe("Soil organic carbon, %."),
    pH: z.number().min(3).max(11).describe("Soil pH."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ cropId, stageId, areaHa, N, P, K, organicCarbon, pH }) => {
    const plan = optimizeFertilizer({ cropId, stageId, areaHa, soil: { N, P, K, organicCarbon, pH } });
    return { content: [{ type: "text", text: JSON.stringify(plan, null, 2) }] };
  },
});
