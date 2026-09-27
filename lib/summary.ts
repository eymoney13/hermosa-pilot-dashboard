import type { Conditions, Driver, ForecastDay, Status, Verdict } from "./data";
import { rainDepth, rainState, rainTotalMm } from "./rain";

// Generates the "What we're seeing" summary shown on boards that hide the raw
// probability (see the `predictionSummary` / `binaryVerdict` flags in
// lib/features.ts).
//
// WHAT THIS IS FOR. The board deliberately shows no numbers, so this prose is
// the only place a reader learns why a beach is rated the way it is. It answers
// that in terms of the weather and water — rain, runoff, river flow, sun, wind,
// tide — and explains the mechanism, because "poor water quality today" is not
// useful on its own but "two days of rain washed bacteria off the streets into
// the harbor" tells someone what to expect tomorrow too.
//
// NO PERCENTAGES. Probabilities, cutoffs and exceedance rates are back-end
// quantities. They drive the Good/Poor call and never appear in this text.
//
// Deliberately template-driven rather than generated: the same inputs must
// always produce the same sentences, and every clause has to be traceable to a
// value the backend published. Where a value is missing — a stale buoy feed, a
// backend that publishes no conditions at all — the sentence that needed it is
// dropped rather than softened into a guess.

function weekdayLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
  });
}

// "Monday", "Monday and Tuesday", "Monday, Tuesday and Wednesday".
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
// The backend publishes metric (it feeds NOAA/USGS/Open-Meteo). These beaches
// are on the Massachusetts coast, so everything a reader sees is customary.

const MM_PER_INCH = 25.4;

// WET_MM, rainState, rainTotalMm and rainDepth now live in lib/rain.ts, shared
// with the contributing-factor list under this paragraph. Each surface used to
// judge "was there rain?" on its own and they disagreed on screen; see that
// module's header for the day they contradicted each other.

// Rain depth as a phrase, not a decimal: "about a quarter inch" reads as
// weather, "0.27 in" reads as instrumentation.
function rainPhrase(mm: number): string {
  const inches = mm / MM_PER_INCH;
  if (inches < 0.2) return "about a tenth of an inch of rain";
  if (inches < 0.38) return "about a quarter inch of rain";
  if (inches < 0.63) return "about half an inch of rain";
  if (inches < 0.88) return "about three quarters of an inch of rain";
  if (inches < 1.25) return "about an inch of rain";
  if (inches < 2) return `about ${inches.toFixed(1)} inches of rain`;
  return `over ${Math.floor(inches)} inches of rain`;
}

function mph(kph: number): number {
  return Math.round(kph / 1.609);
}

function feet(metres: number): number {
  return Math.round(metres * 3.281);
}

function fahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

// ---------------------------------------------------------------------------
// Drivers → topics
// ---------------------------------------------------------------------------
// The model ranks features; a reader cares about subjects. Several distinct
// features ("Recent rainfall", "Rain near sewer outfalls") describe the same
// thing to a swimmer, so they collapse to one topic and produce one sentence.

type Topic = "rain" | "river" | "sun" | "warmth" | "wind" | "tide" | "waves";

const TOPIC_OF: Record<string, Topic> = {
  "Recent rainfall": "rain",
  "Rain near sewer outfalls": "rain",
  "River discharge": "river",
  "High river flow": "river",
  "Moderate river flow": "river",
  "Solar radiation": "sun",
  "Air temperature": "warmth",
  "Water temperature": "warmth",
  "Wind speed": "wind",
  "Onshore wind": "wind",
  "Alongshore wind": "wind",
  "Wind direction": "wind",
  "Tidal range": "tide",
  "High tide level": "tide",
  "Low tide level": "tide",
  "Tide level at sample time": "tide",
  "Spring tide conditions": "tide",
  "Wave height": "waves",
  "Wave period": "waves",
  "Mean wave direction": "waves",
  "Onshore wave energy": "waves",
  "Alongshore wave energy": "waves",
};

// The distinct topics the model leaned on, strongest first. Anything without a
// topic ("Seasonal pattern", "Lunar cycle") is dropped: true, but not something
// a reader can look out the window and check.
function topicsFor(drivers: Driver[]): Topic[] {
  const seen = new Set<Topic>();
  const topics: Topic[] = [];
  for (const d of drivers) {
    const topic = TOPIC_OF[d.factor];
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    topics.push(topic);
  }
  return topics;
}

// ---------------------------------------------------------------------------
// Topic sentences
// ---------------------------------------------------------------------------
// Each returns one sentence combining the measured condition with the mechanism
// by which it affects water quality, or null when the value behind it wasn't
// published. The condition is described from the value; the mechanism is what
// makes the sentence worth reading.
//
// Each also carries a valence — whether the condition it describes is pushing
// water quality up or down. Some mechanisms are one-directional (rain always
// means runoff, sun always means UV die-off); others cut both ways depending on
// the value. conditionSentences uses the valence to keep the paragraph coherent
// with the rating, so a Good day is never explained entirely in terms of things
// that make water worse.
//
// TENSE. A past day is a record of what was predicted, not a prediction, so it
// reads in the past tense throughout — "the river was running low", not "is
// running low". The mechanism half of a sentence usually stays in the present,
// because how sunlight kills bacteria is a standing fact rather than something
// that was only true on Tuesday.

type Valence = "helps" | "hurts";

interface TopicSentence {
  text: string;
  valence: Valence;
}

/** Pick between present- and past-tense wording. */
function tense(past: boolean, present: string, wasPast: string): string {
  return past ? wasPast : present;
}

function rainSentence(c: Conditions, past: boolean): TopicSentence | null {
  const total = rainTotalMm(c);
  if (total == null) return null;

  const window = tense(past, "over the past few days", "in the days before");
  const state = rainState(total);

  // Exactly nothing. The only case that may say "no rain" flatly, and it says
  // it without a depth because "0.0 mm" is a reading where "none" is a fact.
  if (state === "none") {
    return {
      valence: "helps",
      text:
        `There ${tense(past, "has", "had")} been no rain ${window}, so ` +
        `no runoff ${tense(past, "is", "was")} washing bacteria off streets ` +
        `and storm drains into the water, the biggest driver of bacteria along ` +
        `this coast.`,
    };
  }

  // More than nothing, less than a runoff event. This used to be folded in with
  // the line above and read as a flat "no real rain", which is what let the
  // factor list underneath announce rain the summary had just denied. It now
  // says both true things -- it did rain, and it was far too little to matter --
  // and prints the figure that reconciles them.
  if (state === "trace") {
    return {
      valence: "helps",
      text:
        `Only ${rainDepth(total)} of rain ${tense(past, "has", "had")} fallen ` +
        `${window}. That ${tense(past, "is", "was")} very little rain, not ` +
        `enough to wash much bacteria off streets and storm drains into the ` +
        `water.`,
    };
  }

  const phrase = rainPhrase(total);
  // Combined sewer overflows are Boston Harbor's version of the runoff story.
  // Only worth raising for a beach close enough to an outfall to be affected,
  // and only after a storm big enough to activate one. Left in the present
  // tense either way: it describes what storms do here, not what one storm did.
  const nearOutfall = c.csoDistKm != null && c.csoDistKm <= 2;
  const sewer =
    nearOutfall && total >= MM_PER_INCH / 2
      ? " Heavier storms can also push combined sewer overflows into the harbor near here."
      : "";
  return {
    valence: "hurts",
    text:
      `${phrase[0].toUpperCase()}${phrase.slice(1)} (${rainDepth(total)}) ` +
      `${tense(past, "has", "had")} fallen ${window}, and that runoff ` +
      `${tense(past, "carries", "carried")} bacteria off streets and storm ` +
      `drains into the water.${sewer}`,
  };
}

function riverSentence(c: Conditions, past: boolean): TopicSentence | null {
  if (!c.riverFlow) return null;
  const was = tense(past, "is", "was");
  if (c.riverFlow === "low") {
    return {
      valence: "helps",
      text:
        `The nearest river ${was} running low, so it ${was} carrying little ` +
        `inland runoff down to the shoreline.`,
    };
  }
  if (c.riverFlow === "moderate") {
    return {
      valence: "hurts",
      text:
        `The nearest river ${was} running at a moderate level, bringing some ` +
        `inland runoff down to the shoreline.`,
    };
  }
  return {
    valence: "hurts",
    text:
      `The nearest river ${was} running ${c.riverFlow}, which ` +
      `${tense(past, "carries", "carried")} inland runoff and the bacteria in ` +
      `it down to the shoreline.`,
  };
}

function sunSentence(c: Conditions, past: boolean): TopicSentence | null {
  if (c.solarMj == null) return null;
  // Sunlight inactivates faecal bacteria within hours; a bright day is a real
  // cleanup mechanism, an overcast one removes it. Thresholds are ordinary
  // daily-total shortwave values for this latitude in summer.
  if (c.solarMj >= 18) {
    return {
      valence: "helps",
      text:
        `Sunlight ${tense(past, "works", "worked")} in the beach's favor: ` +
        `strong sun breaks down bacteria in the surface water through the day.`,
    };
  }
  if (c.solarMj <= 8) {
    return {
      valence: "hurts",
      text:
        `Cloud cover ${tense(past, "means", "meant")} less ultraviolet light ` +
        `reaching the water, so bacteria that ${tense(past, "do get", "got")} ` +
        `in ${tense(past, "survive", "survived")} longer than they would on a ` +
        `bright day.`,
    };
  }
  return null;
}

function warmthSentence(c: Conditions, past: boolean): TopicSentence | null {
  const water = c.waterTempC;
  const air = c.airTempC;
  if (water != null) {
    return water >= 20
      ? {
          valence: "hurts",
          text:
            `Water temperatures near ${fahrenheit(water)}°F let bacteria ` +
            `persist longer once they ${tense(past, "reach", "reached")} the shoreline.`,
        }
      : {
          valence: "helps",
          text:
            `Cool water near ${fahrenheit(water)}°F ${tense(past, "is", "was")} ` +
            `less hospitable to bacteria than midsummer temperatures.`,
        };
  }
  if (air != null && air >= 27) {
    return {
      valence: "hurts",
      text:
        `A warm day near ${fahrenheit(air)}°F ${tense(past, "keeps", "kept")} ` +
        `the shallows warm, and bacteria survive longer in warm water.`,
    };
  }
  return null;
}

function windSentence(c: Conditions, past: boolean): TopicSentence | null {
  if (c.windKph == null) return null;
  const speed = mph(c.windKph);
  if (speed >= 15) {
    return {
      valence: "helps",
      text:
        `Winds around ${speed} mph ${tense(past, "are", "were")} stirring the ` +
        `nearshore water, which mixes and disperses whatever reaches the beach.`,
    };
  }
  if (speed <= 6) {
    return {
      valence: "hurts",
      text:
        `Light winds ${tense(past, "mean", "meant")} little mixing along the ` +
        `shore, so anything that ${tense(past, "does reach", "reached")} the ` +
        `water ${tense(past, "tends", "tended")} to linger near the beach.`,
    };
  }
  return null;
}

function tideSentence(c: Conditions, past: boolean): TopicSentence | null {
  if (c.springTide) {
    return {
      valence: "helps",
      text:
        `Spring tides around the full moon ${tense(past, "give", "gave")} the ` +
        `biggest daily rise and fall of the month, flushing the shoreline ` +
        `harder than usual.`,
    };
  }
  if (c.tideRangeM == null) return null;
  const range = feet(c.tideRangeM);
  if (range <= 0) return null;
  return {
    valence: "helps",
    text:
      `A tidal range of about ${range} ft ${tense(past, "exchanges", "exchanged")} ` +
      `water along the shore each cycle, which is how the beach clears itself ` +
      `between tides.`,
  };
}

function wavesSentence(c: Conditions, past: boolean): TopicSentence | null {
  if (c.waveHeightM == null) return null;
  const height = feet(c.waveHeightM);
  return height >= 3
    ? {
        valence: "helps",
        text: `Waves running about ${height} ft ${tense(past, "keep", "kept")} the surf zone well mixed.`,
      }
    : {
        valence: "hurts",
        text: `Small surf ${tense(past, "means", "meant")} less mixing in the shallows than a rougher day.`,
      };
}

const TOPIC_SENTENCE: Record<
  Topic,
  (c: Conditions, past: boolean) => TopicSentence | null
> = {
  rain: rainSentence,
  river: riverSentence,
  sun: sunSentence,
  warmth: warmthSentence,
  wind: windSentence,
  tide: tideSentence,
  waves: wavesSentence,
};

// Three subjects is the ceiling on purpose — still a paragraph a swimmer reads
// in one go, not an inventory of the model's feature ranking. A reader who
// wants that has the contributing-factors list further down the card.
//
// Three only became worth writing once the backend published its top 15 drivers
// rather than its top 3: the strongest features cluster into families (today's
// rain, 3-day rain and 14-day rain are three features but one subject), so a
// top-3 collapsed to two distinct subjects for nearly every beach and a third
// sentence would have had to come from the hardcoded fallback order rather than
// from anything the model actually weighted.
const MAX_TOPICS = 3;

// Topics to fall back on, most consequential first, when the model's own top
// three don't yield enough to say. Rain leads because runoff is the dominant
// bacteria source at these beaches whether or not it happens to top the SHAP
// ranking on a given day.
const FALLBACK_TOPICS: Topic[] = ["rain", "river", "sun", "tide", "wind", "waves", "warmth"];

// The conditions half of the summary: what the model leaned on, said plainly.
//
// Sentences whose valence matches the rating come first, because a paragraph
// that opens "expected to have good water quality" and then lists only things
// that make water worse reads as a contradiction — the reader is left asking
// why it is good. Conflicting sentences are not discarded, just ranked behind:
// on a Poor day it is worth knowing the sun is helping, and one of each reads
// as a balanced explanation rather than a one-sided one.
//
// Candidates come from the model's ranking first, then from FALLBACK_TOPICS —
// the top three drivers can easily be three variations on wind, leaving nothing
// to say about the dry spell that is actually keeping the beach clean. Nothing
// here claims a topic was a top driver; these sentences describe conditions,
// and the ranked contributing factors are listed separately on the card.
function conditionSentences(
  drivers: Driver[],
  c: Conditions,
  verdict: Verdict,
  past: boolean
): string[] {
  const ranked = topicsFor(drivers);
  const candidates = [...ranked, ...FALLBACK_TOPICS.filter((t) => !ranked.includes(t))];

  // A day with real rain on it leads with the rain, whatever the rating. Half
  // an inch is the single fact a reader most wants, and on a day the model
  // still calls Good the valence sort below would drop it for two sentences
  // that agree with the rating — silently omitting the storm. Leading with it
  // and letting an agreeing sentence follow says both true things: it rained,
  // and here is why the beach is expected to hold up anyway.
  //
  // A DRY spell gets no such guarantee. It is the absence of an event, not an
  // event, so it stays in the ordinary sort — otherwise a Poor day during a dry
  // stretch opens "there has been no real rain", which reads as an argument
  // that the water is fine and buries the reason it isn't.
  const rain = rainSentence(c, past);
  const pinned = rain?.valence === "hurts" ? rain : null;

  const helps: string[] = [];
  const hurts: string[] = [];
  for (const topic of candidates) {
    if (topic === "rain" && pinned) continue; // already leading
    const sentence = TOPIC_SENTENCE[topic](c, past);
    if (!sentence) continue;
    (sentence.valence === "helps" ? helps : hurts).push(sentence.text);
  }

  // Good and Poor lead with the conditions that agree with the call and let the
  // rest follow, so the paragraph explains the rating before qualifying it.
  //
  // Moderate is the one rating that is genuinely about both at once: something
  // is pushing bacteria up, and something else is keeping it under the
  // threshold. Sorting it like Poor would read as a bad day; sorting it like
  // Good would bury the reason it is not simply good. So it alternates,
  // starting with what is elevating the water - which is the news - and then
  // what is holding it down.
  const rest =
    verdict === "Good"
      ? [...helps, ...hurts]
      : verdict === "Poor"
        ? [...hurts, ...helps]
        : interleave(hurts, helps);

  return (pinned ? [pinned.text, ...rest] : rest).slice(0, MAX_TOPICS);
}

/** Alternate two lists, starting with the first, then append whatever is left. */
function interleave(first: string[], second: string[]): string[] {
  const out: string[] = [];
  const n = Math.max(first.length, second.length);
  for (let i = 0; i < n; i++) {
    if (first[i]) out.push(first[i]);
    if (second[i]) out.push(second[i]);
  }
  return out;
}


// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface SummaryInput {
  /**
   * The beach's name as it should be said in a sentence, already stripped of
   * any tab-label disambiguator (BeachData.proseName). Passed ready to print:
   * only the roster knows which part of a name is a place and which is a
   * suffix bolted on to tell two rows apart.
   */
  name: string;
  /** The resolved Good/Poor call for the selected day. */
  verdict: Verdict | null;
  /** The selected day's ISO date. */
  date: string;
  /**
   * Where the selected day sits relative to now. Drives tense as well as
   * content: a past day is a record of what was predicted, so it reads in the
   * past tense and carries no outlook (that would be describing days that have
   * already happened). Matches the window-cell type the card already tracks.
   */
  timeframe: "past" | "today" | "forecast";
  /** The model had no recent lab sample to anchor this beach. */
  noRecentSample: boolean;
  /** The selected day's ranked environmental drivers, strongest first. */
  drivers: Driver[];
  /** The selected day's measured conditions. */
  conditions: Conditions;
  /**
   * The risk tier the card is displaying, on boards that show the shared
   * 30/50/75 tiers rather than the model's own verdict. Supplying it switches
   * the prose into tier vocabulary AND makes every rating in the summary — the
   * lead, the valence ordering, the outlook — derive from the same tiers the
   * reader can see, so the paragraph cannot contradict the label above it.
   *
   * Omit on a binaryVerdict board: there the card shows the verdict itself and
   * `verdict` is already the thing on screen.
   */
  status?: Status | null;
  /** The tiers for `forecast`, index-matched, when `status` is supplied. */
  forecastStatuses?: (Status | null)[];
  /** Upcoming days. Only described when the selected day is today. */
  forecast: ForecastDay[];
  /**
   * Whether to describe the days ahead. Defaults to true. A board that has put
   * the forecast behind a paywall passes false, so the free summary explains
   * today without narrating the days it is charging for.
   */
  includeOutlook?: boolean;
}

// The summary has to describe a day in the same terms the card does, because it
// sits directly beneath the card's own label. Two boards label a day two ways:
// a binaryVerdict board shows the model's Good/Moderate/Poor call against the
// beach's own cutoff, and every other board shows the shared 30/50/75 risk
// tiers. Those disagree: a 34% day is "Good" against a 50% cutoff and
// "Moderate bacteria levels" on the shared scale, so a summary that always
// spoke in verdicts would open "expected to have good water quality" directly
// under a card reading "Moderate bacteria levels". On South Bay's record that
// lands on 8% of scored beach-days.
//
// So the vocabulary is chosen by the caller, which is the only party that knows
// which label it rendered. Nothing about the underlying call changes: the tier
// board still ranks and orders exactly as before, it just says "low bacteria
// levels" where the verdict board says "good water quality".
interface Vocabulary {
  /** "<subject> is expected to have <this>" — the noun phrase for a rating. */
  phrase: Record<Verdict, string>;
  /** The bare adjective the outlook uses ("stay good as well"). */
  word: Record<Verdict, string>;
}

const VERDICT_VOCAB: Vocabulary = {
  phrase: {
    Good: "good water quality",
    Moderate: "moderate water quality",
    Poor: "poor water quality",
  },
  word: { Good: "good", Moderate: "moderate", Poor: "poor" },
};

// The key's own words, lowercased for mid-sentence use. Kept in step with
// TIER_LABEL in lib/data.ts: the paragraph sits under the card's label and the
// key sits beside it, so a reader meets the same three words in both places.
const TIER_VOCAB: Vocabulary = {
  phrase: {
    Good: "low bacteria levels",
    Moderate: "moderate bacteria levels",
    Poor: "high bacteria levels",
  },
  word: { Good: "low", Moderate: "moderate", Poor: "high" },
};

// The shared risk tiers onto the three ratings the prose is built around. The
// mapping is 1:1, since Status is the internal 3-tier value. The key's fourth
// band ("Very high bacteria levels", above 75%) needs no separate word here:
// Status does not distinguish it either, so the paragraph says "high bacteria
// levels" wherever the card's own label does.
const VERDICT_OF_STATUS: Record<Status, Verdict> = {
  Normal: "Good",
  "Slightly elevated": "Moderate",
  "Not recommended": "Poor",
};

// Sentence 1: the call, in words.
function leadSentence(
  short: string,
  verdict: Verdict,
  timeframe: SummaryInput["timeframe"],
  date: string,
  vocab: Vocabulary
): string {
  const quality = vocab.phrase[verdict];
  if (timeframe === "past") {
    // Past tense, and "was predicted" rather than "had": this is the record of
    // a forecast, not a measurement of what the water actually turned out to be.
    return `${short} was predicted to have ${quality} on ${weekdayLong(date)}.`;
  }
  const when = timeframe === "today" ? "today" : `on ${weekdayLong(date)}`;
  return `${short} is expected to have ${quality} ${when}.`;
}

// The next few days, described by how they are called rather than by any
// number. Named days only — "Thursday and Friday" is something a reader can
// plan around.
//
// Phrased relative to today's rating: "stay good as well" is only true if today
// is good, and a run of clean days after a poor one is an improvement, which is
// the more useful thing to tell someone.
function outlookSentence(
  forecast: ForecastDay[],
  todayVerdict: Verdict,
  vocab: Vocabulary,
  ratingOf: (d: ForecastDay) => Verdict | null
): string | null {
  const days = forecast.filter((d) => ratingOf(d));
  if (days.length === 0) return null;

  const w = vocab.word;

  const one = days.length === 1;
  const span = one ? "Tomorrow" : `The next ${days.length} days`;
  const verb = one ? "is" : "are";
  const allLook = one ? "tomorrow looks" : `the next ${days.length} days all look`;
  const poor = days.filter((d) => ratingOf(d) === "Poor");
  const moderate = days.filter((d) => ratingOf(d) === "Moderate");

  // Named days, e.g. "Thursday and Friday are".
  const naming = (subset: ForecastDay[]) => ({
    names: joinList(subset.map((d) => weekdayLong(d.date))),
    subjectVerb: subset.length === 1 ? "is" : "are",
  });
  // What the days NOT named are doing. Once there are three ratings, "the other
  // day holds" is no longer specific enough - the unnamed days could be good or
  // moderate, and those are different news.
  const others = (count: number, rating: string) =>
    count === 1 ? `the other day looks ${rating}` : `the other ${count} days look ${rating}`;

  // A poor day in the window is the headline whatever else is in there.
  if (poor.length > 0) {
    if (poor.length === days.length) {
      return todayVerdict === "Poor"
        ? `${span} ${verb} expected to stay ${w.Poor} as well.`
        : `${span} ${verb} all expected to turn ${w.Poor}.`;
    }
    const { names, subjectVerb } = naming(poor);
    const rest = days.length - poor.length;
    // Name the remainder exactly when it is all one rating. When it is mixed,
    // "moderate or better" is the honest summary - listing both in a third
    // clause makes the sentence longer than the information is worth.
    const restRating =
      moderate.length === 0
        ? w.Good
        : moderate.length === rest
          ? w.Moderate
          : `${w.Moderate} or better`;
    return `Looking ahead, ${names} ${subjectVerb} expected to turn ${w.Poor}; ${others(rest, restRating)}.`;
  }

  // Nothing is flagged, but some days are elevated.
  if (moderate.length > 0) {
    if (moderate.length === days.length) {
      if (todayVerdict === "Moderate") {
        return `${span} ${verb} expected to stay ${w.Moderate} as well.`;
      }
      return todayVerdict === "Poor"
        ? `Conditions are expected to ease: ${allLook} ${w.Moderate} rather than ${w.Poor}.`
        : `${span} ${verb} expected to turn ${w.Moderate}.`;
    }
    const { names, subjectVerb } = naming(moderate);
    const rest = days.length - moderate.length;
    return `Looking ahead, ${names} ${subjectVerb} expected to be ${w.Moderate}; ${others(rest, w.Good)}.`;
  }

  // Everything ahead is good.
  return todayVerdict === "Good"
    ? `${span} ${verb} expected to stay ${w.Good} as well.`
    : `Conditions are expected to improve: ${allLook} ${w.Good}.`;
}

// Why there is no lab result to point at. Framed as what the forecast IS rather
// than as a shortfall — an environment-driven prediction on a day nobody
// sampled is the whole point of the model, not a caveat on it.
function noSampleNote(past: boolean): string {
  return past
    ? "There was no recent lab test for this beach, so that was a forecast " +
      "from conditions rather than a reading from the water."
    : "There is no recent lab test for this beach, so this is a forecast from " +
      "current conditions rather than a reading from the water.";
}

/**
 * Build the summary as paragraphs. Returns [] when the day can't be classified,
 * which the caller renders as nothing rather than a half-written sentence.
 */
export function buildSummary(input: SummaryInput): string[] {
  // On a tier board the tier IS the rating — deriving it here rather than
  // reading input.verdict is what keeps the lead, the sentence ordering and the
  // outlook all agreeing with the card. On a verdict board nothing changes.
  const tierMode = input.status != null;
  const vocab = tierMode ? TIER_VOCAB : VERDICT_VOCAB;
  const verdict = tierMode
    ? VERDICT_OF_STATUS[input.status as Status]
    : input.verdict;
  if (!verdict) return [];

  // Forecast days are rated the same way as today, so a run of days never
  // reads as "stay normal as well" off one scale and "good" off another.
  const ratingOf = tierMode
    ? (d: ForecastDay) => {
        const st = input.forecastStatuses?.[input.forecast.indexOf(d)] ?? d.status;
        return st ? VERDICT_OF_STATUS[st] ?? null : null;
      }
    : (d: ForecastDay) => d.verdict ?? null;

  // Already trimmed for prose upstream, where the roster knows which part of a
  // name is a disambiguator and which is the place itself. This used to split
  // on " - " here, which worked on Boston's "Carson Beach - South Boston" and
  // silently wrecked South Bay's "Hermosa Beach - Herondo St": both Hermosa
  // stations came out as plain "Hermosa Beach", so the two cards introduced
  // themselves identically and the street, the only thing telling them apart,
  // was the part thrown away.
  const short = input.name;

  const past = input.timeframe === "past";

  const first = [
    leadSentence(short, verdict, input.timeframe, input.date, vocab),
    ...conditionSentences(input.drivers ?? [], input.conditions ?? {}, verdict, past),
  ].join(" ");

  // The outlook describes days *after* today, so it only belongs on today's
  // view — from a forecast day it would be describing the past. It is also the
  // one sentence here that gives away the forecast, so a board that has locked
  // the forecast suppresses it (see lib/paywall.ts): describing the days a
  // reader cannot see would be the paywall talking around itself.
  const second = [
    input.timeframe === "today" && input.includeOutlook !== false
      ? outlookSentence(input.forecast, verdict, vocab, ratingOf)
      : null,
    input.noRecentSample ? noSampleNote(past) : null,
  ]
    .filter(Boolean)
    .join(" ");

  return second ? [first, second] : [first];
}
