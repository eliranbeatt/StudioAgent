"use node";

// import { chromium } from "playwright";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { renderQuoteHtml } from "../shared/quotePrintTemplate";

export const generateQuotePdf = action({
  args: {
    projectId: v.id("projects"),
    quoteId: v.id("quoteVersions"),
  },
  handler: async (ctx, args) => {
    /*
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
      logoUrl: logoDataUrl,
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
    */
   throw new Error("PDF generation temporarily disabled during deployment fix.");
  },
});
