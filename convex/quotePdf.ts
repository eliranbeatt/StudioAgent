"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { chromium } from "playwright";

export const generateQuotePdf = action({
  args: {
    projectId: v.id("projects"),
    quoteId: v.id("quoteVersions"),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.runQuery(api.quotes.getQuote, { quoteId: args.quoteId });
    if (!quote) throw new Error("Quote not found");

    const overview = await ctx.runQuery(api.projects.getOverview, { id: args.projectId });
    if (!overview?.project) throw new Error("Project not found");

    let logoDataUrl = "";
    if (quote.inputs?.logoFileId) {
      const logoFile = await ctx.runQuery(internal.files.getFileRecord, {
        fileId: quote.inputs.logoFileId,
      });
      if (logoFile) {
        const blob = await ctx.storage.get(logoFile.storageId);
        if (blob) {
          const buffer = Buffer.from(await blob.arrayBuffer());
          logoDataUrl = `data:${logoFile.contentType};base64,${buffer.toString("base64")}`;
        }
      }
    }

    const html = renderQuoteHtml({
      projectName: overview.project.name,
      customerName: overview.project.customerName ?? overview.project.clientName ?? "",
      quote,
      logoDataUrl,
    });

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "24mm", right: "18mm", bottom: "24mm", left: "18mm" },
      });

      const storageId = await ctx.storage.store(
        new Blob([pdfBuffer], { type: "application/pdf" })
      );

      const fileId = await ctx.runMutation(internal.files.saveFileRecord, {
        projectId: args.projectId,
        storageId,
        fileName: `quote-${quote.version ?? quote._id}.pdf`,
        contentType: "application/pdf",
        size: pdfBuffer.byteLength,
      });

      await ctx.runMutation(api.quotes.updateQuote, {
        quoteId: args.quoteId,
        patch: { pdfFileId: fileId },
      });

      return { fileId };
    } finally {
      await browser.close();
    }
  },
});

function renderQuoteHtml({
  projectName,
  customerName,
  quote,
  logoDataUrl,
}: {
  projectName: string;
  customerName: string;
  quote: any;
  logoDataUrl: string;
}) {
  const blocks = quote.quoteBlocks ?? {};
  const includeFlags = quote.inputs?.includeFlags ?? {};

  const section = (title: string, items: string[]) => {
    if (!items || items.length === 0) return "";
    return `
      <section>
        <h2>${escapeHtml(title)}</h2>
        <ul>
          ${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}
        </ul>
      </section>
    `;
  };

  const optionsSection = () => {
    const options = blocks.options_he ?? [];
    if (!options.length) return "";
    const rendered = options
      .map((item: any) => {
        if (typeof item === "string") return `<li>${escapeHtml(item)}</li>`;
        const name = escapeHtml(item?.name_he ?? "");
        const delta = item?.deltaNIS ? ` (${Number(item.deltaNIS).toLocaleString("he-IL")} ₪)` : "";
        const note = item?.note_he ? ` - ${escapeHtml(item.note_he)}` : "";
        return `<li>${name}${delta}${note}</li>`;
      })
      .join("");
    return `
      <section>
        <h2>אופציות</h2>
        <ul>${rendered}</ul>
      </section>
    `;
  };

  const headerLogo = logoDataUrl
    ? `<img class="logo" src="${logoDataUrl}" alt="Logo" />`
    : `<div class="logo-placeholder"></div>`;

  const scheduleItems =
    includeFlags.includeDates === false ? [] : (blocks.schedule_he ?? []);
  const agreementsItems =
    includeFlags.includeAgreements === false ? [] : (blocks.agreements_he ?? []);
  const termsItems = includeFlags.includeTerms === false ? [] : (blocks.terms_he ?? []);

  return `
    <!doctype html>
    <html lang="he" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(blocks.title_he ?? "הצעת מחיר")}</title>
        <style>
          :root {
            color-scheme: light;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            font-family: "Arial", "Helvetica", sans-serif;
            color: #111827;
            background: #ffffff;
          }
          main {
            padding: 28px 36px;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 18px;
            margin-bottom: 24px;
          }
          .logo {
            max-height: 60px;
            max-width: 180px;
            object-fit: contain;
          }
          .logo-placeholder {
            width: 180px;
            height: 60px;
          }
          .meta {
            text-align: left;
            color: #6b7280;
            font-size: 12px;
            line-height: 1.4;
          }
          h1 {
            font-size: 24px;
            margin: 0 0 6px;
          }
          p.lead {
            margin: 0;
            color: #4b5563;
            font-size: 14px;
          }
          section {
            margin-top: 22px;
          }
          h2 {
            margin: 0 0 8px;
            font-size: 15px;
            color: #111827;
          }
          ul {
            margin: 0;
            padding-right: 16px;
            color: #374151;
            line-height: 1.6;
            font-size: 13px;
          }
          .summary {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            padding: 12px 14px;
            border-radius: 10px;
            margin-top: 18px;
          }
          .signature {
            margin-top: 28px;
            white-space: pre-line;
            color: #111827;
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <main>
          <header>
            ${headerLogo}
            <div class="meta">
              <div>${escapeHtml(customerName || "לקוח")}</div>
              <div>${escapeHtml(projectName)}</div>
              <div>${new Date(quote._creationTime ?? Date.now()).toLocaleDateString("he-IL")}</div>
            </div>
          </header>

          <h1>${escapeHtml(blocks.title_he ?? "הצעת מחיר")}</h1>
          <p class="lead">${escapeHtml(blocks.intro_he ?? "")}</p>

          ${includeFlags.includeElements === false ? "" : section("היקף העבודה", blocks.scope_he ?? [])}
          ${section("תוצרים", blocks.deliverables_he ?? [])}
          ${section("לוח זמנים", scheduleItems)}

          ${section("סיכום מחיר", blocks.priceSummary_he ?? [])}

          ${section("הסכמות", agreementsItems)}
          ${optionsSection()}
          ${section("הנחות", blocks.assumptions_he ?? [])}
          ${section("אי הכללות", blocks.exclusions_he ?? [])}
          ${section("תנאים", termsItems)}

          <div class="summary">
            <div>${escapeHtml(quote.priceSummary?.vatNote_he ?? "")}</div>
            <div>${escapeHtml(blocks.validUntil_he ?? "")}</div>
          </div>

          <div class="signature">${escapeHtml(blocks.signatureBlock_he ?? "")}</div>
        </main>
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
