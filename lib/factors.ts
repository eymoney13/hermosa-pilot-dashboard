const FACTOR_CANONICAL: Record<string, string> = {
  // Prior bacteria / exceedance history — collapsed
  "Recent exceedance history": "Prior bacteria level",
  "Recent bacteria level": "Prior bacteria level",
  "Prior bacteria level": "Prior bacteria level",

  // Tide — kept separate (different meanings)
  "Hours since high tide": "Hours since high tide",
  tide_max: "Tide level",
  tide_sample: "Tide at sample time",

  // Rainfall — collapsed (all rainfall is rainfall)
  precip: "Recent rainfall",
  "2-day cumulative rainfall": "Recent rainfall",
  "Yesterday rainfall": "Recent rainfall",
  "Rain and high tide combination": "Recent rainfall",
  lograin1: "Recent rainfall",
  lograin2: "Recent rainfall",
  lograin3: "Recent rainfall",

  // Solar — collapsed
  "Solar radiation today": "Solar radiation",
  "Solar radiation 1 days ago": "Solar radiation",
  solar_radiation: "Solar radiation",

  // Atmospheric — kept individual (each is meaningfully different)
  air_temp: "Air temperature",
  water_temp: "Water temperature",
  wind_speed: "Wind speed",
  humidity: "Humidity",

  // Other
  "Days since last sample": "Days since last sample",
  MWD_mean: "Mean wave direction",
};

export function factorLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return FACTOR_CANONICAL[trimmed] ?? trimmed;
}
