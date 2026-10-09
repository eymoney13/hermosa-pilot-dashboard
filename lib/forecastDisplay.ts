/**
 * How the 1–3 day forecast is shown.
 *
 * The same-day nowcast is the validated model. The look-ahead days have not
 * shown real skill live, so they are labeled experimental unless this switch
 * is set to "hide", which removes them. Labeling is the default. Hiding does
 * not change today's reading.
 *
 * `FORECAST_HIDDEN_STATIONS` drops the look-ahead for named station codes
 * even while the switch is "label". Leave it empty; the product owner decides
 * which beaches, if any.
 */
export type ForecastHorizonMode = "label" | "hide";

export const FORECAST_HORIZON_MODE: ForecastHorizonMode = "label";

export const FORECAST_HIDDEN_STATIONS: readonly string[] = [];

export type ForecastHorizon = "label" | "hidden" | "hidden-station";

export function forecastHorizonFor(stationCode: string): ForecastHorizon {
  if (FORECAST_HORIZON_MODE === "hide") return "hidden";
  if (FORECAST_HIDDEN_STATIONS.includes(stationCode)) return "hidden-station";
  return "label";
}

export const FORECAST_EXPERIMENTAL_LABEL = "Experimental";

export const FORECAST_EXPERIMENTAL_EXPLANATION =
  "These next three days are still being tested. Today’s reading is the one checked against lab samples.";

export const FORECAST_HIDDEN_STATION_NOTE =
  "A multi-day forecast isn’t shown for this beach.";

/** Offer copy that stays true when the look-ahead is labeled or hidden. */
export function lookAheadOfferLine(alertsEnabled: boolean): string {
  if (FORECAST_HORIZON_MODE === "hide") {
    return alertsEnabled
      ? "Email alerts when a beach you follow changes."
      : "Today’s reading for every beach on the board.";
  }
  return alertsEnabled
    ? "Email alerts, plus an experimental look at the next 3 days."
    : "An experimental look at the next 3 days.";
}

export function lookAheadProFeature(): string | null {
  if (FORECAST_HORIZON_MODE === "hide") return null;
  return "An experimental look at the next 3 days";
}
