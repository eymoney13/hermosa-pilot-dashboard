import type { Status } from "./data";

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
