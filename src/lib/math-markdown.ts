/** Normalise legacy TeX delimiters before remark-math parses the content. */
export function normalizeMathMarkdown(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/\\\[/g, () => "\n$$\n")
    .replace(/\\\]/g, () => "\n$$\n")
    .replace(/\\\(/g, () => "$")
    .replace(/\\\)/g, () => "$")
    .replace(/\$\$([\s\S]*?)\$\$/g, (match, inner: string, offset: number, source: string) => {
      const previous = source[offset - 1];
      const next = source[offset + match.length];
      const blockLike = (!previous || previous === "\n") && (!next || next === "\n");
      if (blockLike || inner.includes("\n")) return match;
      return `$${inner.trim()}$`;
    })
    .replace(/(^|[^\\])\$([^$\n]+)\$/g, (match, prefix: string, inner: string) => {
      const text = inner.trim();
      // LLMs occasionally wrap a Vietnamese word in dollar delimiters. KaTeX then
      // renders it as broken math instead of readable lesson text.
      if (/[^\x00-\x7F]/.test(text) && !/[\\0-9=+*/^_<>()[\]{}|]/.test(text)) return `${prefix}${text}`;
      return match;
    });
}

/** Answers are often returned as bare TeX because the entire field is mathematical. */
export function normalizeMathAnswer(value: string | null | undefined) {
  const normalized = normalizeMathMarkdown(value).trim();
  if (
    !normalized ||
    hasMathDelimiter(normalized) ||
    hasNaturalLanguage(normalized) ||
    !looksLikeTex(normalized)
  ) return normalized;
  return `$$\n${normalized}\n$$`;
}

/** Render the shorthand students can type on a phone without changing submitted text. */
export function studentMathPreview(value: string | null | undefined) {
  if (!value?.trim()) return "";
  return value
    .split("\n")
    .map((line) => {
      if (!line.trim() || hasMathDelimiter(line)) return line;
      if (hasStudentNaturalLanguage(line)) return previewMixedStudentMath(line);
      const math = normalizeStudentMathSyntax(line);
      return `$${math.trim()}$`;
    })
    .join("\n");
}

function previewMixedStudentMath(value: string) {
  const mathToken = /\\(?:overrightarrow|vec)\{[^{}\n]+\}|\\frac\{[^{}\n]+\}\{[^{}\n]+\}|sqrt\([^()\n]+\)|\([^()\s]+\)\s*\/\s*\([^()\s]+\)|-?[A-Za-z0-9]+\/-?[A-Za-z0-9]+|[A-Za-z0-9)]+\^(?:\{[^{}\n]+\}|[-A-Za-z0-9+]+)|<=|>=|!=|≤|≥|≠|∈|∪|∩|→/g;
  return value.replace(mathToken, (token) => `$${normalizeStudentMathSyntax(token).trim()}$`);
}

function normalizeStudentMathSyntax(value: string) {
  return value
    .replace(/\\vec\{([^{}]+)\}/g, "\\overrightarrow{$1}")
    .replace(/<=|≤/g, "\\leq ")
    .replace(/>=|≥/g, "\\geq ")
    .replace(/!=|≠/g, "\\neq ")
    .replace(/∈/g, "\\in ")
    .replace(/∪/g, "\\cup ")
    .replace(/∩/g, "\\cap ")
    .replace(/→/g, "\\to ")
    .replace(/sqrt\(([^()]+)\)/g, "\\sqrt{$1}")
    .replace(/\(([^()\s]+)\)\s*\/\s*\(([^()\s]+)\)/g, "\\frac{$1}{$2}")
    .replace(/(^|[\s=(])(-?[A-Za-z0-9]+)\/(-?[A-Za-z0-9]+)(?=$|[\s),;+\-])/g, "$1\\frac{$2}{$3}");
}

function hasStudentNaturalLanguage(value: string) {
  // TeX arguments such as AB in \\vec{AB} are symbols, not prose. Remove the
  // complete command before applying the natural-language safety check.
  const withoutTexCommands = value.replace(/\\[A-Za-z]+(?:\{[^{}]*\})?/g, " ");
  return hasNaturalLanguage(withoutTexCommands);
}

function hasMathDelimiter(value: string) {
  return /(^|[^\\])\$/.test(value);
}

function looksLikeTex(value: string) {
  return /\\(?:frac|dfrac|tfrac|sqrt|left|right|cdot|times|div|pm|neq|leq|geq|sum|prod|int|sin|cos|tan|log|ln|alpha|beta|theta|pi|begin|overline|overrightarrow|underline|vec|mathbf|mathrm)\b|[_^](?:\{[^}]+\}|[A-Za-z0-9()+-])/.test(value);
}

function hasNaturalLanguage(value: string) {
  const withoutCommands = value.replace(/\\[A-Za-z]+/g, "");
  const words = withoutCommands.match(/\p{L}{2,}/gu) || [];
  const mathWords = new Set(["sqrt", "sin", "cos", "tan", "log", "ln"]);
  return words.some((word) => !mathWords.has(word.toLowerCase()));
}
