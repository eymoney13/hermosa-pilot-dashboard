import { EPA_MPN_THRESHOLD, type Status } from "./data";

// Flip any tone-bearing words in the insight to match the computed status.
// Low-risk lexicon:  Safe / Normal / Low Bacteria
// High-risk lexicon: Unsafe / Not Recommended / High Bacteria
// Both old and new vocab are matched so model output written with either set is normalized.
export function normalizeInsight(insight: string, status: Status): string {
  if (!insight) return "";

  // Slightly-elevated is a middle band — let the model describe it in its own
  // words rather than forcing it into the binary safe/unsafe lexicon.
  if (status === "Slightly elevated") return insight;

  const replacements: Array<[RegExp, string]> =
    status === "Not recommended"
      ? [
          // High-risk words: keep meaning, normalize wording to "Not recommended"
          [/\bNot Recommended\b/g, "Not recommended"],
          [/\bUnsafe\b/g, "Not recommended"],
          [/\bunsafe\b/g, "not recommended"],
          [/\bHigh Bacteria\b/g, "Not recommended"],
          [/\bhigh bacteria\b/g, "not recommended"],
          // Low-risk words: flip to "Not recommended" because they conflict with status
          [/\bSafe\b/g, "Not recommended"],
          [/\bsafe\b/g, "not recommended"],
          [/\bNormal\b/g, "Not recommended"],
          [/\bnormal\b/g, "not recommended"],
          [/\bLow Bacteria\b/g, "Not recommended"],
          [/\blow bacteria\b/g, "not recommended"],
        ]
      : [
          // High-risk words: flip to "Normal" because they conflict with status
          [/\bNot Recommended\b/g, "Normal"],
          [/\bNot recommended\b/g, "Normal"],
          [/\bnot recommended\b/g, "normal"],
          [/\bUnsafe\b/g, "Normal"],
          [/\bunsafe\b/g, "normal"],
          [/\bHigh Bacteria\b/g, "Normal"],
          [/\bhigh bacteria\b/g, "normal"],
          // Low-risk words: normalize wording to "Normal"
          [/\bSafe\b/g, "Normal"],
          [/\bsafe\b/g, "normal"],
          [/\bLow Bacteria\b/g, "Normal"],
          [/\blow bacteria\b/g, "normal"],
        ];

  let out = insight;
  for (const [re, replacement] of replacements) {
    out = out.replace(re, replacement);
  }
  return out;
}


/**
 * One sentence about the most recent lab sample, for the "Latest lab sample
 * result" line.
 *
 * Built here rather than lifted out of the backend's `insight` narrative. That
 * narrative is a paragraph covering the weather, the model's drivers and the
 * beach's base rate as well as the sample, and this section is supposed to say
 * one thing. Reading the two published numbers directly is both shorter and
 * steadier than trying to cut one clause out of generated prose.
 *
 * One sentence, and only about the sample. How old it is already appears on the
 * metadata line directly beneath, so repeating it here would spend half the
 * sentence on something the reader can already see. No em dashes.
 */
export function labSampleSentence(
  lastResult: number | string | null
): string | null {
  if (lastResult == null || lastResult === "") return null;
  const mpn = Number(lastResult);
  if (!Number.isFinite(mpn)) return null;

  // Whether the sample itself was an exceedance is the one fact worth pairing
  // with the number: 5 and 500 mean nothing to a reader who does not carry the
  // EPA limit in their head.
  const rounded = Math.round(mpn);
  const where =
    mpn > EPA_MPN_THRESHOLD
      ? `above the EPA safe swimming limit of ${EPA_MPN_THRESHOLD}`
      : `below the EPA safe swimming limit of ${EPA_MPN_THRESHOLD}`;
  return `The most recent lab sample measured ${rounded} MPN/100mL, ${where}.`;
}
