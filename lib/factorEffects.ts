import type { Conditions, Driver, FactorDirection } from "./data";
import { rainDepth, rainState, rainTotalMm } from "./rain";

// Plain-language explanation of how one contributing factor is affecting the
// water, for the list under "Top contributing factors".
//
// The ranked list on its own names things without explaining them: "Hours since
// high tide" is the model's vocabulary, not a swimmer's, and a reader who does
// not already know why it matters learns nothing from seeing it ranked first.
// These lines answer the only question the list raises.
//
// WRITTEN FOR SOMEONE STANDING ON THE BEACH. One sentence, no jargon, and no
// em dashes. Each says what is happening and why it matters to the water, in
// that order, so the sentence stays readable if the reader stops halfway.
//
// No numbers either, with one deliberate exception: rain names its depth. A
// direction alone cannot separate a downpour from 0.7 mm, and describing the
// latter as "recent rain washing bacteria off streets" contradicted the summary
// directly above it, which called the same day dry. The depth is the only thing
// that reconciles the two, so rain is measured out loud and nothing else is.
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
/**
 * The rain factors, whose line is measured rather than looked up.
 *
 * Both describe the same runoff story from the same figures, so both get the
 * depth. Keyed on the canonical labels lib/factors.ts collapses the model's
 * rain features into.
 */
const RAIN_FACTORS = new Set(["Recent rainfall", "Rain near sewer outfalls"]);

/**
 * The rain line, built from the day's measured depth instead of its direction.
 *
 * Returns null when the backend published no rain figures at all -- a stale
 * weather feed blanks them, and a blank is not a dry spell. The caller falls
 * back to the direction-only wording, which claims no depth.
 *
 * Note this ignores the SHAP direction on purpose. Direction is what the model
 * did with the number; the number is what actually fell, and where the two
 * disagreed it was always the direction that misled -- a non-zero trace reads
 * as "increasing risk" and rendered as a sentence about bacteria washing off
 * streets, on a day 0.7 mm fell. Stating the depth cannot be wrong that way.
 */
function rainLine(factor: string, c: Conditions | undefined): string | null {
  const total = rainTotalMm(c);
  if (total == null) return null;
  const nearOutfall = factor === "Rain near sewer outfalls";

  switch (rainState(total)) {
    case "none":
      return nearOutfall
        ? "There has been no rain, so the sewer outfalls are not overflowing toward the beach."
        : "There has been no rain in the past few days, so nothing is washing in off the land.";
    case "trace":
      return nearOutfall
        ? `Only ${rainDepth(total)} of rain has fallen, very little rain, and far too little to make the sewer outfalls overflow.`
        : `Only ${rainDepth(total)} of rain has fallen in the past few days. That is very little rain, not enough to wash much in off the land.`;
    default:
      return nearOutfall
        ? `${rainDepth(total)} of rain has fallen, enough that the sewer outfalls can push overflow toward the beach.`
        : `${rainDepth(total)} of rain has fallen in the past few days, washing bacteria off streets and storm drains into the water.`;
  }
}

export function factorEffect(
  factor: string,
  direction: FactorDirection | null | undefined,
  conditions?: Conditions
): string | null {
  const effect = EFFECTS[factor];
  if (!effect || !direction) return null;
  if (RAIN_FACTORS.has(factor)) {
    const measured = rainLine(factor, conditions);
    if (measured) return measured;
  }
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


/**
 * How a direction is drawn next to a factor: an arrow, a colour, and the words
 * a screen reader gets instead.
 *
 * The arrow points the way WATER QUALITY is going, not the way the model's risk
 * number is. Those are opposites, and the reader's question is about the water:
 * a factor the model scored as "increasing risk" is making the water worse, so
 * it gets a red arrow up, and one decreasing risk is making it cleaner, so it
 * gets a green arrow down. Picking the other convention would mean a green
 * arrow pointing up on a day the beach is getting dirtier.
 *
 * `label` is not decoration. Colour and arrow direction are the only things
 * carrying this meaning visually, which leaves out anyone reading with a screen
 * reader and anyone who cannot separate the red from the green, so the words go
 * in the markup too.
 */
export interface DirectionStyle {
  /** Which way the arrow points, following water quality. */
  arrow: "up" | "down";
  color: string;
  label: string;
}

export const DIRECTION_STYLE: Record<FactorDirection, DirectionStyle> = {
  "increasing risk": {
    arrow: "up",
    // The same pair ForecastAccuracy draws its matched/missed samples in, so
    // green and red mean one thing across the card.
    color: "#cc3333",
    label: "making water quality worse",
  },
  "decreasing risk": {
    arrow: "down",
    color: "#2d8a4e",
    label: "making water quality cleaner",
  },
};
