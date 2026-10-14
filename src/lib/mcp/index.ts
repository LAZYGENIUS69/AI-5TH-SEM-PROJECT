import { defineMcp } from "@lovable.dev/mcp-js";
import searchGuides from "./tools/search-guides";
import weather from "./tools/weather";
import irrigation from "./tools/irrigation";
import fertilizer from "./tools/fertilizer";

export default defineMcp({
  name: "pixel-perfect",
  title: "Pixel Perfect",
  version: "0.1.0",
  instructions:
    "AgriSense farm advisory tools: search built-in agronomy guide passages, fetch a live 7-day forecast, compute an irrigation plan, and calculate fertilizer doses from a soil test. All data is public; no login.",
  tools: [searchGuides, weather, irrigation, fertilizer],
});
