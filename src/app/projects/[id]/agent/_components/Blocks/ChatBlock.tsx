"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ChatBlock({ block }: { block: any }) {
  const content = block.markdownHe ?? block.text ?? "";

  return (
    <div className="prose prose-sm max-w-none text-slate-800 text-sm leading-relaxed" dir="rtl">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(content)}</ReactMarkdown>
    </div>
  );
}
