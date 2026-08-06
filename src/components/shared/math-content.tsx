import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeMathMarkdown, normalizeMathAnswer } from "@/lib/math-markdown";

type MathContentProps = {
  children: string | null | undefined;
  className?: string;
  answer?: boolean;
};

/** Shared safe Markdown + KaTeX renderer for teacher and student surfaces. */
export function MathContent({ children, className = "", answer = false }: MathContentProps) {
  const content = answer ? normalizeMathAnswer(children) : normalizeMathMarkdown(children);
  return (
    <div className={["markdown-body", className].filter(Boolean).join(" ")}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
