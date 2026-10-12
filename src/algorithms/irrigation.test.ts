import { describe, expect, it } from "vitest";
import { DSS_SOILS, totalAvailableWater, waterStress } from "./fao56DualKc";
import { solveMpc, type HourForecast } from "./irrigationMpc";
import { diag, kalmanStep } from "./soilKalman";

const hours = (n: number, f: (i: number) => Partial<HourForecast> = () => ({})): HourForecast[] =>
  Array.from({ length: n }, (_, i) => ({ time: `2026-10-12T${String(i % 24).padStart(2, "0")}:00`, hour: i % 24, et0: 0.3, rain: 0, rainProb: 0, ...f(i) }));

describe("FAO-56", () => {
  it("TAW = 1000(θFC−θWP)Zr for clay loam over 0.4 m", () => {
    expect(totalAvailableWater(DSS_SOILS.clay_loam, 0.4)).toBeCloseTo(52, 5);
  });
  it("Ks is 1 up to RAW and falls linearly to 0 at TAW", () => {
    expect(waterStress(20, 50, 0.5)).toBe(1);
    expect(waterStress(37.5, 50, 0.5)).toBeCloseTo(0.5, 5);
    expect(waterStress(50, 50, 0.5)).toBe(0);
  });
});

describe("MPC", () => {
  it("holds the pump when likely rain arrives before stress", () => {
    const plan = solveMpc({ forecast: hours(72, (i) => (i >= 2 && i < 6 ? { rain: 8, rainProb: 90 } : {})), dr0: 25, taw: 52, raw: 28, kc: 1 });
    expect(plan.firstAction).toBe(false);
    expect(plan.grossWaterMm).toBe(0);
  });
  it("does not pump during peak tariff hours when depletion is moderate", () => {
    const plan = solveMpc({ forecast: hours(72), dr0: 20, taw: 52, raw: 28, kc: 1 });
    expect(plan.steps.filter((s) => s.pump && s.hour >= 18 && s.hour < 22)).toHaveLength(0);
    expect(plan.pumpHours).toBeGreaterThan(0);
  });
});

describe("Kalman observer", () => {
  it("rejects a reading more than 3σ from the prediction", () => {
    const u = { infiltrationMm: 0, transpirationMm: 0, evaporationMm: 0, thetaFC: 33, thetaWP: 20, drainage: 0.05, thetaSat: 45 };
    const r = kalmanStep({ x: [28, 28, 28], P: diag([0.2, 0.2, 0.2]) }, [28, 40, 28], u, { raw: [], normalized: [] });
    expect(r.faults[1]).toBe("spike");
    expect(r.accepted[1]).toBe(false);
    expect(r.state.x[1]).toBeCloseTo(28, 1);
  });
});
