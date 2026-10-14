import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { retrieve } from "@/algorithms/ragEngine";

export default defineTool({
  name: "search_guides",
  title: "Search agronomy guide passages",
  description:
    "Search AgriSense's built-in agronomy guide passages (TF-IDF + MMR) and return the top matches with similarity scores.",
  inputSchema: {
    query: z.string().min(2).max(300).describe("Farming question or keywords, e.g. 'wheat nitrogen timing'."),
    topK: z.number().int().min(1).max(5).optional().describe("Number of passages to return (default 3)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query, topK }) => {
    const { results } = retrieve(query, topK ? { topK } : undefined);
    const text = results.length
      ? results.map((r, i) => `[${i + 1}] ${r.source} — ${r.section} (crop: ${r.crop}, score ${r.score})\n${r.text}`).join("\n\n")
      : "No guide passage matched this query.";
    return { content: [{ type: "text", text }] };
  },
});
