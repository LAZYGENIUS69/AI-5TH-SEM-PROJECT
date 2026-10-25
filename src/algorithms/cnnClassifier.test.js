import { describe, expect, test } from "bun:test";
import { CLASS_COUNT, INPUT_SIZE, LOW_CONFIDENCE_THRESHOLD, parseLabel, topPredictions, validateCnnLabels, validateCnnOutput } from "./cnnClassifier";
import { buildRetrievalQuery } from "./agentFlow";

describe("trained CNN contract", () => {
  test("raw image resize uses 224 pixels", () => expect(INPUT_SIZE).toBe(224));
  test("accepts [1,38] probability output", () => {
    expect(CLASS_COUNT).toBe(38);
    expect(validateCnnOutput([1, 38], Array(38).fill(1 / 38))).toBeCloseTo(1);
  });
  test("rejects malformed shape, non-probabilities and incorrect sum", () => {
    expect(() => validateCnnOutput([38], Array(38).fill(1 / 38))).toThrow();
    expect(() => validateCnnOutput([1, 38], Array(38).fill(NaN))).toThrow();
    expect(() => validateCnnOutput([1, 38], Array(38).fill(0))).toThrow();
  });
  test("requires 38 unique ordered crop/disease labels", () => {
    const labels = Array.from({ length: 38 }, (_, i) => `Crop___Disease_${i}`);
    expect(validateCnnLabels(labels)).toEqual(labels);
    expect(() => validateCnnLabels(labels.slice(1))).toThrow();
    expect(() => validateCnnLabels(Array(38).fill("Tomato___healthy"))).toThrow();
  });
  test("parses crop and disease names and healthy labels", () => {
    expect(parseLabel("Tomato___Early_blight")).toEqual({ crop: "Tomato", disease: "Early blight", healthy: false });
    expect(parseLabel("Tomato___healthy").healthy).toBe(true);
  });
  test("top three predictions retain output label order and confidence", () => {
    const predictions = topPredictions([0.2, 0.65, 0.1, 0.05], ["Tomato___healthy", "Tomato___Early_blight", "Corn___rust", "Apple___scab"]);
    expect(predictions).toHaveLength(3);
    expect(predictions[0]?.disease).toBe("Early blight");
    expect(predictions[0]?.confidence).toBe(0.65);
  });
  test("low-confidence cutoff remains 60 percent", () => expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.6));
  test("agent retrieval uses the CNN crop and disease", () => {
    expect(buildRetrievalQuery({ crop: "Tomato", disease: "Early blight", confidence: 0.8, at: "2026-10-25" })).toBe("Tomato Early blight management");
  });
});