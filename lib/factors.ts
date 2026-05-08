export const FACTOR_LABELS: Record<string, string> = {
  tide_max: "Tide level",
  tide_sample: "Tide at sample time",
  precip: "Recent rainfall",
  lograin1: "Yesterday's rainfall",
  lograin2: "2-day cumulative rainfall",
  lograin3: "3-day cumulative rainfall",
  air_temp: "Air temperature",
  water_temp: "Water temperature",
  wind_speed: "Wind speed",
  solar_radiation: "Solar radiation",
  humidity: "Humidity",
};

export function factorLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return FACTOR_LABELS[trimmed] ?? trimmed;
}
