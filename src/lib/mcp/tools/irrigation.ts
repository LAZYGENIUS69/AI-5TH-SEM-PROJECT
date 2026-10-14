import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchForecast } from "@/services/weather";
import { buildIrrigationSchedule, CROP_WATER_PROFILES, SOIL_PROFILES, STAGE_KEYS } from "@/algorithms/weatherAdvisor";

export default defineTool({
  name: "get_irrigation_plan",
  title: "Compute 7-day irrigation plan",
  description:
    "Compute a 7-day irrigation plan (Hargreaves ET, crop Kc, soil water, rain postponement) from the live forecast for a location.",
  inputSchema: {
    latitude: z.number().min(-90).max(90).describe("Field latitude."),
    longitude: z.number().min(-180).max(180).describe("Field longitude."),
    cropId: z.enum(CROP_WATER_PROFILES.map((c) => c.id) as [string, ...string[]]).describe("Crop id."),
    soilId: z.enum(SOIL_PROFILES.map((s) => s.id) as [string, ...string[]]).describe("Soil type id."),
    stage: z.enum(STAGE_KEYS).describe("Growth stage."),
    areaHa: z.number().min(0.01).max(10000).describe("Field area in hectares."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ latitude, longitude, cropId, soilId, stage, areaHa }) => {
    const crop = CROP_WATER_PROFILES.find((c) => c.id === cropId);
    const soil = SOIL_PROFILES.find((s) => s.id === soilId);
    if (!crop || !soil) throw new ToolError("Unknown crop or soil.");
    const f = await fetchForecast(latitude, longitude);
    const plan = buildIrrigationSchedule({
      forecast: f.daily, latitude, crop, soil, stage, areaHa,
      initialDepletionMm: crop.rootDepthM * soil.availableWaterMmPerM * crop.depletionFraction * 0.7,
    });
    const text = plan.days
      .map((d) => `${d.date}: ${d.action} ${d.waterMm} mm (ETc ${d.etc} mm) — ${d.reason}`)
      .join("\n");
    return { content: [{ type: "text", text: `${crop.name}, ${soil.name}, ${areaHa} ha\n${text}\nTotal: ${plan.totalWaterMm} mm` }] };
  },
});
