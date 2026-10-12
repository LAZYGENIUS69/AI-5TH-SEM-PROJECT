import type { DailyWeather } from "@/algorithms/weatherAdvisor";

export interface GeoPlace {
  name: string;
  admin: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface ForecastBundle {
  current: { temperature: number; humidity: number; windSpeed: number; weatherCode: number };
  daily: DailyWeather[];
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";

export async function searchPlaces(query: string): Promise<GeoPlace[]> {
  if (query.trim().length < 2) return [];
  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not search for that place right now.");
  const json = (await res.json()) as {
    results?: {
      name: string;
      admin1?: string;
      country?: string;
      latitude: number;
      longitude: number;
    }[];
  };
  return (json.results ?? []).map((r) => ({
    name: r.name,
    admin: r.admin1 ?? "",
    country: r.country ?? "",
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

export async function fetchForecast(lat: number, lon: number): Promise<ForecastBundle> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_max,weather_code",
    timezone: "auto",
    forecast_days: "7",
  });
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`);
  if (!res.ok) throw new Error("Weather service is not responding. Try again in a moment.");
  const json = (await res.json()) as {
    current: {
      temperature_2m: number;
      relative_humidity_2m: number;
      wind_speed_10m: number;
      weather_code: number;
    };
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      relative_humidity_2m_mean: number[];
      wind_speed_10m_max: number[];
      weather_code: number[];
    };
  };

  const daily: DailyWeather[] = json.daily.time.map((date, i) => ({
    date,
    tMax: json.daily.temperature_2m_max[i] ?? 0,
    tMin: json.daily.temperature_2m_min[i] ?? 0,
    precipitation: json.daily.precipitation_sum[i] ?? 0,
    humidity: json.daily.relative_humidity_2m_mean[i] ?? 0,
    windSpeed: json.daily.wind_speed_10m_max[i] ?? 0,
  }));

  return {
    current: {
      temperature: json.current.temperature_2m,
      humidity: json.current.relative_humidity_2m,
      windSpeed: json.current.wind_speed_10m,
      weatherCode: json.current.weather_code,
    },
    daily,
  };
}

export const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  80: "Rain showers",
  81: "Heavy showers",
  82: "Violent showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm",
};

export function describeWeather(code: number) {
  return WEATHER_CODE_LABELS[code] ?? "Mixed conditions";
}

export interface HourlyPoint {
  time: string;
  hour: number;
  et0: number;
  rain: number;
  rainProb: number;
  temperature: number;
  humidity: number;
  windMs: number;
}

/** Hourly Open-Meteo forecast: FAO Penman-Monteith ET₀, rain and rain probability (7 days). */
export async function fetchHourlyForecast(lat: number, lon: number): Promise<HourlyPoint[]> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "et0_fao_evapotranspiration,precipitation,precipitation_probability,temperature_2m,relative_humidity_2m,wind_speed_10m",
    wind_speed_unit: "ms",
    timezone: "auto",
    forecast_days: "7",
  });
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`);
  if (!res.ok) throw new Error("Hourly forecast is not available right now.");
  const json = (await res.json()) as {
    hourly: {
      time: string[];
      et0_fao_evapotranspiration: (number | null)[];
      precipitation: (number | null)[];
      precipitation_probability: (number | null)[];
      temperature_2m: (number | null)[];
      relative_humidity_2m: (number | null)[];
      wind_speed_10m: (number | null)[];
    };
  };
  const h = json.hourly;
  return h.time.map((time, i) => ({
    time,
    hour: Number(time.slice(11, 13)),
    et0: h.et0_fao_evapotranspiration[i] ?? 0,
    rain: h.precipitation[i] ?? 0,
    rainProb: h.precipitation_probability[i] ?? 0,
    temperature: h.temperature_2m[i] ?? 25,
    humidity: h.relative_humidity_2m[i] ?? 60,
    windMs: h.wind_speed_10m[i] ?? 2,
  }));
}
