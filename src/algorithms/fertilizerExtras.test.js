import { expect, test } from "bun:test";
import { soilHealthRating, estimateCost } from "./fertilizerOptimizer.ts";

test("soil health bands", () => {
  const r = soilHealthRating({ N: 240, P: 30, K: 200, organicCarbon: 0.6, pH: 8 });
  expect(r).toEqual({ N: "low", P: "high", K: "medium", organicCarbon: "medium", pH: "alkaline" });
});

test("cost rounds up to whole 50 kg bags", () => {
  const c = estimateCost([{ product: "Urea", nutrientContent: "", kgPerHa: 51, totalKg: 51 }], { Urea: 300 });
  expect(c.lines[0].bags).toBe(2);
  expect(c.total).toBe(600);
});
