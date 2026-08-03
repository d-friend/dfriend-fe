/** Normalise legacy TeX delimiters before remark-math parses the content. */
export function normalizeMathMarkdown(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/\\\[/g, "\n$$\n")
    .replace(/\\\]/g, "\n$$\n")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");
}
