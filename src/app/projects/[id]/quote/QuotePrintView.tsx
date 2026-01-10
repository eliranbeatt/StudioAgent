import { renderQuoteHtml } from "../../../../../shared/quotePrintTemplate";

type QuotePrintViewProps = {
  projectName: string;
  customerName: string;
  quote: any;
  logoUrl?: string;
};

export default function QuotePrintView({
  projectName,
  customerName,
  quote,
  logoUrl,
}: QuotePrintViewProps) {
  const html = renderQuoteHtml({
    projectName,
    customerName,
    quote,
    logoUrl,
  });

  return (
    <iframe
      title="Quote preview"
      className="w-full min-h-[720px] border rounded-lg bg-white"
      srcDoc={html}
    />
  );
}
