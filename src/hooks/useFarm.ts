import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchForecast } from "@/services/weather";

export interface FarmSettings {
  placeName: string;
  latitude: number;
  longitude: number;
  cropId: string;
  soilId: string;
  stage: "initial" | "development" | "mid" | "late";
  areaHa: number;
}

export const DEFAULT_FARM: FarmSettings = {
  placeName: "Nagpur, Maharashtra",
  latitude: 21.1458,
  longitude: 79.0882,
  cropId: "wheat",
  soilId: "clay_loam",
  stage: "mid",
  areaHa: 2,
};

const KEY = "agrisense.farm.v1";

export function useFarm() {
  const [farm, setFarm] = useState<FarmSettings>(DEFAULT_FARM);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setFarm({ ...DEFAULT_FARM, ...(JSON.parse(raw) as Partial<FarmSettings>) });
    } catch {
      /* ignore corrupt storage */
    }
    setLoaded(true);
  }, []);

  const update = useCallback((patch: Partial<FarmSettings>) => {
    setFarm((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  return { farm, update, loaded };
}

export function useForecast(latitude: number, longitude: number, enabled = true) {
  return useQuery({
    queryKey: ["forecast", latitude.toFixed(3), longitude.toFixed(3)],
    queryFn: () => fetchForecast(latitude, longitude),
    enabled,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}
