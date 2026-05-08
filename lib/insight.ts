import type { Status } from "./data";

export function normalizeInsight(insight: string, status: Status): string {
  if (!insight) return "";
  const replacements: Array<[RegExp, string]> =
    status === "High Bacteria"
      ? [
          [/\bSafe\b/g, "High Bacteria"],
          [/\bsafe\b/g, "high bacteria"],
          [/\bNormal\b/g, "High Bacteria"],
          [/\bnormal\b/g, "high bacteria"],
          [/\bUnsafe\b/g, "High Bacteria"],
          [/\bunsafe\b/g, "high bacteria"],
          [/\bNot Recommended\b/g, "High Bacteria"],
          [/\bnot recommended\b/g, "high bacteria"],
          [/\bLow Bacteria\b/g, "High Bacteria"],
          [/\blow bacteria\b/g, "high bacteria"],
        ]
      : [
          [/\bNot Recommended\b/g, "Low Bacteria"],
          [/\bnot recommended\b/g, "low bacteria"],
          [/\bUnsafe\b/g, "Low Bacteria"],
          [/\bunsafe\b/g, "low bacteria"],
          [/\bSafe\b/g, "Low Bacteria"],
          [/\bsafe\b/g, "low bacteria"],
          [/\bNormal\b/g, "Low Bacteria"],
          [/\bnormal\b/g, "low bacteria"],
          [/\bHigh Bacteria\b/g, "Low Bacteria"],
          [/\bhigh bacteria\b/g, "low bacteria"],
        ];
  let out = insight;
  for (const [re, replacement] of replacements) {
    out = out.replace(re, replacement);
  }
  return out;
}
