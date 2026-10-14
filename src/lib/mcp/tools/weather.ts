import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchForecast } from "@/services/weather";

export default defineTool({
  name: "get_weather_forecast",
  title: "Get 7-day weather forecast",
  description: "Fetch the live 7-day Open-Meteo forecast (temperature, rain, humidity, wind) for a latitude/longitude.",
  inputSchema: {
    latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
    longitude: z.number().min(-180).max(180).describe("Longitude in decimal degrees."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ latitude, longitude }) => {
    const f = await fetchForecast(latitude, longitude);
    const lines = f.daily.map(
      (d) => `${d.date}: ${d.tMin}–${d.tMax}°C, rain ${d.precipitation} mm, RH ${d.humidity}%, wind ${d.windSpeed} km/h`,
    );
    return { content: [{ type: "text", text: `Now: ${f.current.temperature}°C, RH ${f.current.humidity}%\n${lines.join("\n")}` }] };
  },
});
