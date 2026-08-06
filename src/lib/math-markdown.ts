/** Normalise legacy TeX delimiters before remark-math parses the content. */
export function normalizeMathMarkdown(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/\\\[/g, () => "\n$$\n")
    .replace(/\\\]/g, () => "\n$$\n")
    .replace(/\\\(/g, () => "$")
    .replace(/\\\)/g, () => "$");
}

/** Answers are often returned as bare TeX because the entire field is mathematical. */
export function normalizeMathAnswer(value: string | null | undefined) {
  const normalized = normalizeMathMarkdown(value).trim();
  if (!normalized || hasMathDelimiter(normalized) || !looksLikeTex(normalized)) return normalized;
  return `$$\n${normalized}\n$$`;
}

function hasMathDelimiter(value: string) {
  return /(^|[^\\])\$/.test(value);
}

function looksLikeTex(value: string) {
  return /\\(?:frac|dfrac|tfrac|sqrt|left|right|cdot|times|div|pm|neq|leq|geq|sum|prod|int|sin|cos|tan|log|ln|alpha|beta|theta|pi|begin|overline|underline|vec|mathbf|mathrm)\b|[_^](?:\{[^}]+\}|[A-Za-z0-9()+-])/.test(value);
}
