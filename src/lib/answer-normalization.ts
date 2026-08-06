/**
 * Frontend mirror of the conservative AI/Nest answer contract.
 *
 * This is only for displaying checkpoint correctness. Authoritative Session 2
 * grading still happens on the server. Keep it deliberately non-algebraic: it
 * normalizes notation, never guesses that two different expressions are equal.
 */
export function canonicalAnswer(value: string | null | undefined) {
  let normalized = (value || "").trim().toLowerCase();
  for (let pass = 0; pass < 2; pass += 1) {
    normalized = normalized.replace(
      /\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
      "$1/$2",
    );
  }
  return normalized
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, "√$1")
    .replace(/sqrt\(([^()]+)\)/g, "√$1")
    .replace(/\\(?:cdot|times)|[×·*]/g, "")
    .replace(/\$|\\(?:left|right)|\\[,;!]|\\\s|[{}\s]/g, "")
    .replace(/\.+$/, "")
    .replace(/^(\d+),(\d+)$/, "$1.$2");
}
