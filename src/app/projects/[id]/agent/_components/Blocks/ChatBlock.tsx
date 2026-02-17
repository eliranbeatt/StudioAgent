"use client";

import ReactMarkdown from "react-markdown";

export function ChatBlock({ block }: { block: any }) {
  const content = block.markdownHe ?? block.text ?? "";

  return (
    <div className="prose prose-sm max-w-none text-slate-800 text-sm leading-relaxed" dir="rtl">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
