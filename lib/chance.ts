// The honest chance of unsafe bacteria, in words.
//
// The headline number on the CA boards is the Neptune Index (0-100, the beach's
// warning line at 50). It is deliberately NOT a probability, so a reader who wants
// "how likely, really?" gets it here, from the backend's calibrated `chance_unsafe`.
// On a typical clean day that is a few percent even when the index reads 25.
//
// Natural frequencies ("about 1 in 8") are used instead of percentages because they
// are read correctly far more often, and because a bare "5%" next to an index of 28
// would invite readers to compare two numbers that are on different scales.

/** "About 1 in 8 chance", or null when the backend published no chance. */
export function chancePhrase(chance: number | null | undefined): string | null {
  if (chance == null || !Number.isFinite(chance)) return null;
  const p = Math.max(0, Math.min(1, chance));
  if (p < 0.01) return "Less than 1 in 100 chance";
  if (p < 0.095) return `About ${Math.round(p * 100)} in 100 chance`;
  if (p < 0.45) return `About 1 in ${Math.round(1 / p)} chance`;
  if (p < 0.95) return `About ${Math.round(p * 10)} in 10 chance`;
  return "Very high chance";
}

/**
 * The full secondary line: "About 1 in 8 chance the water tests unsafe today."
 * `when` is the time phrase, e.g. "today" or "on Friday".
 */
export function chanceSentence(
  chance: number | null | undefined,
  when: string
): string | null {
  const phrase = chancePhrase(chance);
  return phrase ? `${phrase} the water tests unsafe ${when}.` : null;
}
