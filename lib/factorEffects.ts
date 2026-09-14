import type { Driver, FactorDirection } from "./data";

// Plain-language explanation of how one contributing factor is affecting the
// water, for the list under "Top contributing factors".
//
// The ranked list on its own names things without explaining them: "Hours since
// high tide" is the model's vocabulary, not a swimmer's, and a reader who does
// not already know why it matters learns nothing from seeing it ranked first.
// These lines answer the only question the list raises.
//
// WRITTEN FOR SOMEONE STANDING ON THE BEACH. One sentence, no jargon, no
// numbers, and no em dashes. Each says what is happening and why it matters to
// the water, in that order, so the sentence stays readable if the reader stops
// halfway.
//
// Keyed by the canonical display label from lib/factors.ts, which is the same
// string the list itself shows, so a label that renders has an entry here.
// Direction comes from the model's SHAP sign: the same factor reads opposite
// ways on different days, and saying "strong sunlight is killing bacteria" on a
// day the model scored sunlight as *raising* risk would be backwards.
interface Effect {
  /** The factor pushed the model's risk estimate up. */
  raising: string;
  /** The factor pushed it down. */
  lowering: string;
}

const EFFECTS: Record<string, Effect> = {
  "Recent rainfall": {
    raising:
      "Recent rain is washing bacteria off streets and storm drains into the water.",
    lowering:
      "It has stayed dry, so very little bacteria is washing in off the land.",
  },
  "Rain near sewer outfalls": {
    raising:
      "Rain near the sewer outfalls can push overflow toward the beach.",
    lowering:
      "Without rain, the sewer outfalls are not overflowing toward the beach.",
  },

  // Tides
  "Tidal range": {
    raising:
      "A big swing between high and low tide stirs up bacteria resting in the sand.",
    lowering:
      "A small swing between high and low tide leaves the sand undisturbed.",
  },
  "High tide level": {
    raising:
      "A high tide lifts bacteria out of the wet sand and carries it into the water.",
    lowering:
      "The high tide is not reaching far enough up the sand to stir bacteria loose.",
  },
  "Low tide level": {
    raising:
      "A very low tide exposes sand and concentrates runoff right at the waterline.",
    lowering:
      "The low tide is not exposing much sand, so runoff stays spread out.",
  },
  "Tide level at sample time": {
    raising: "The tide right now is concentrating bacteria close to shore.",
    lowering: "The tide right now is spreading bacteria away from shore.",
  },
  "Hours since high tide": {
    raising:
      "Enough time has passed since high tide for bacteria to build up near shore.",
    lowering:
      "The time since high tide has given the water a chance to clear itself.",
  },
  "Spring tide conditions": {
    raising:
      "Spring tides move a lot of water and stir bacteria out of the sand.",
    lowering: "Tides are gentle right now, so less is stirred out of the sand.",
  },

  // Waves
  "Wave height": {
    raising: "Bigger waves are stirring bacteria up off the seabed.",
    lowering: "Small waves are leaving the seabed settled.",
  },
  "Wave period": {
    raising:
      "Long, powerful swell reaches deep and lifts bacteria off the bottom.",
    lowering:
      "Short, choppy waves are not reaching deep enough to lift bacteria.",
  },
  "Mean wave direction": {
    raising:
      "The swell is angled to hold runoff against the beach instead of carrying it off.",
    lowering: "The swell is angled to carry runoff away from the beach.",
  },
  "Onshore wave energy": {
    raising:
      "Waves are pushing water, and anything in it, straight toward the beach.",
    lowering: "Waves are pushing very little toward the beach.",
  },
  "Alongshore wave energy": {
    raising: "Waves are dragging runoff sideways along the beach.",
    lowering: "Waves are not moving much water along the beach.",
  },

  // Wind
  "Wind speed": {
    raising: "Wind is pushing surface water, and anything in it, toward shore.",
    lowering: "Light wind means little is being pushed toward shore.",
  },
  "Wind direction": {
    raising: "The wind is blowing surface water toward the beach.",
    lowering: "The wind is blowing surface water away from the beach.",
  },
  "Onshore wind": {
    raising:
      "Wind blowing in off the ocean pushes anything floating toward the beach.",
    lowering: "The wind is not pushing surface water toward the beach.",
  },
  "Alongshore wind": {
    raising: "Wind along the coast is driving runoff down the beach.",
    lowering: "Wind along the coast is too light to carry runoff far.",
  },

  // Sun and temperature
  "Solar radiation": {
    raising: "There is little sun today, so less bacteria is being killed off.",
    lowering: "Strong sunlight is killing bacteria in the water.",
  },
  "Air temperature": {
    raising: "Warmer weather helps bacteria survive longer.",
    lowering: "Cooler weather makes it harder for bacteria to survive.",
  },
  "Water temperature": {
    raising: "Warm water lets bacteria live longer once they reach the shore.",
    lowering: "Cool water makes bacteria die off faster.",
  },

  // Rivers
  "River discharge": {
    raising: "The nearby river is carrying inland runoff down to the beach.",
    lowering: "The nearby river is low, so little runoff is reaching the beach.",
  },
  "High river flow": {
    raising:
      "The nearby river is running high and carrying a lot of runoff to the beach.",
    lowering: "River flow has dropped, so less runoff is reaching the beach.",
  },
  "Moderate river flow": {
    raising: "The nearby river is carrying a steady amount of runoff to the beach.",
    lowering: "River flow is mild and is not adding much runoff.",
  },

  // Calendar
  "Seasonal pattern": {
    raising: "This time of year usually runs higher for bacteria at this beach.",
    lowering: "This time of year usually runs cleaner at this beach.",
  },
  "Lunar cycle": {
    raising: "The moon is driving strong tides that stir up more bacteria.",
    lowering: "The moon is driving gentler tides that stir up less.",
  },
};

/**
 * The plain-language line for one factor, or null when there is nothing honest
 * to say about it.
 *
 * Null rather than a vague stand-in on purpose. A bullet reading "this is
 * raising risk" restates the ranking without explaining anything, and a factor
 * with no published direction cannot be described at all: the same feature
 * reads opposite ways on different days, so guessing one would be a coin flip
 * presented as an explanation. The caller renders the factor with no line under
 * it instead, which is the honest version of not knowing.
 */
export function factorEffect(
  factor: string,
  direction: FactorDirection | null | undefined
): string | null {
  const effect = EFFECTS[factor];
  if (!effect || !direction) return null;
  return direction === "increasing risk" ? effect.raising : effect.lowering;
}

/**
 * Index the day's drivers by factor label, so the displayed list can look up
 * the direction the model gave each one.
 *
 * The visible list and the driver list are built from the same ranking but
 * filtered differently (a driver needs a published direction; a listed factor
 * does not), so they are matched by label rather than by position.
 */
export function directionsByFactor(
  drivers: Driver[]
): Map<string, FactorDirection> {
  const map = new Map<string, FactorDirection>();
  for (const d of drivers) {
    if (!map.has(d.factor)) map.set(d.factor, d.direction);
  }
  return map;
}
