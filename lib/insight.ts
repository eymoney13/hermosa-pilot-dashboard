import type { Status } from "./data";

/**
 * Replace em dashes in backend-written insight text with ordinary punctuation.
 *
 * The dashboard uses no em dashes, but this copy is generated upstream and
 * arrives with them, including in history files that are already published, so
 * it has to be handled where it is rendered rather than only at the source.
 *
 * A comma, specifically. The insight has a punctuation hierarchy already: a
 * colon introduces the list of signals, semicolons separate the items, and the
 * em dash sits inside one item. A comma is the mark at that level, and it also
 * happens to be the right one for every shape the generator actually produces:
 * an appositive ("(unsafe only ~3% of the time), typically an enclosed harbor
 * beach"), a conjunction ("traps contamination, so its baseline is higher"),
 * and an explanation ("is lowering risk, the timing relative to high tide
 * affects ..."). A colon would nest a second colon under the first and read
 * worse; a semicolon would be indistinguishable from the item separator.
 */
function stripEmDashes(text: string): string {
  return (
    text
      .replace(/\s*—\s*/g, ", ")
      // The dash sometimes follows punctuation that already ends the clause.
      .replace(/,\s*,/g, ",")
      .replace(/([;:])\s*,/g, "$1")
  );
}

// Flip any tone-bearing words in the insight to match the computed status.
// Low-risk lexicon:  Safe / Normal / Low Bacteria
// High-risk lexicon: Unsafe / Not Recommended / High Bacteria
// Both old and new vocab are matched so model output written with either set is normalized.
export function normalizeInsight(insight: string, status: Status): string {
  if (!insight) return "";

  // Slightly-elevated is a middle band, so let the model describe it in its own
  // words rather than forcing it into the binary safe/unsafe lexicon. The dash
  // pass still applies, since that is punctuation rather than tone.
  if (status === "Slightly elevated") return stripEmDashes(insight);

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
  return stripEmDashes(out);
}
