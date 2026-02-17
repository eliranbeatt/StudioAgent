"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { completionWithTracing } from "./lib/llm";
import OpenAI from "openai";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const MAX_EXTRACTED_CHARS = 20000;
const MAX_SUMMARY_CHARS = 1200;
const STRUCTURED_MODEL = "gpt-5.2";

export const saveUploadedFile = action({
    args: {
        projectId: v.id("projects"),
        storageId: v.id("_storage"),
        fileName: v.string(),
        contentType: v.string(),
        size: v.number(),
    },
    handler: async (ctx, args) => {
        const extracted = await extractText(ctx, args.storageId, args.contentType, args.fileName);
        const summary = summarizeText(extracted ?? "");
        const extractedInfo = extracted
            ? await extractStructuredInfo(ctx, extracted, args.fileName, args.projectId)
            : null;

        const fileId = await ctx.runMutation(internal.files.saveFileRecord, {
            projectId: args.projectId,
            storageId: args.storageId,
            fileName: args.fileName,
            contentType: args.contentType,
            size: args.size,
            extractedText: extracted ?? undefined,
            summary: extractedInfo?.summary ?? summary ?? undefined,
            extractedInfo: extractedInfo ?? undefined,
        });
        const knowledgeSnippet = extractedInfo?.summary ?? summary;
        if (knowledgeSnippet) {
            // Trigger D: schedule knowledge doc refresh after file upload/parse
            const sdkKnowledge = (api as any)['sdk/knowledge'] ?? (api as any).sdk?.knowledge;
            if (sdkKnowledge?.summarizeOrUpdate) {
                try {
                    await ctx.runAction(sdkKnowledge.summarizeOrUpdate, {
                        projectId: args.projectId,
                        newFacts: [`Uploaded file: ${args.fileName}`, `Summary: ${knowledgeSnippet}`],
                    });
                } catch (err) {
                    console.warn('Post-upload knowledge refresh failed:', err);
                }
            }
        }
        return { fileId };
    },
});

async function extractText(ctx: any, storageId: any, contentType: string, fileName: string) {
    const blob = await ctx.storage.get(storageId);
    if (!blob) return null;

    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    const isText =
        contentType.startsWith("text/") ||
        contentType.includes("json") ||
        contentType.includes("csv") ||
        contentType.includes("markdown") ||
        ["txt", "csv", "md", "markdown", "json"].includes(extension);

    if (isText) {
        const text = await blob.text();
        return text.slice(0, MAX_EXTRACTED_CHARS);
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (extension === "docx" || contentType.includes("word")) {
        const result = await mammoth.extractRawText({ buffer });
        return result.value.slice(0, MAX_EXTRACTED_CHARS);
    }

    if (extension === "xlsx" || extension === "xls" || contentType.includes("spreadsheet")) {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetTexts: string[] = [];
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;
            const csv = XLSX.utils.sheet_to_csv(sheet);
            if (csv.trim()) {
                sheetTexts.push(`Sheet: ${sheetName}\n${csv}`);
            }
        }
        return sheetTexts.join("\n\n").slice(0, MAX_EXTRACTED_CHARS);
    }

    if (extension === "pdf" || contentType.includes("pdf")) {
        const data = await pdfParse(buffer);
        return data.text.slice(0, MAX_EXTRACTED_CHARS);
    }

    return null;
}

function summarizeText(text: string) {
    if (!text) return null;
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const summaryLines = lines.slice(0, 10);
    const summary = summaryLines.join(" | ").slice(0, MAX_SUMMARY_CHARS);
    return summary;
}

async function extractStructuredInfo(ctx: any, text: string, fileName: string, projectId: any) {
    if (!process.env.OPENAI_API_KEY) return null;

    const prompt = [
        "Extract structured information from the document text.",
        "Return JSON only, with this schema:",
        "{",
        '  "topics": string[],',
        '  "domain": string,',
        '  "entities": [{ "name": string, "type"?: string }],',
        '  "summary": string,',
        '  "facts": string[],',
        '  "language": string',
        "}",
        "Rules:",
        "- Use the document language for values.",
        "- Be concise; keep summary under 6 sentences.",
        "- Facts should be short bullet-like statements.",
    ].join("\n");

    const completionPayload: any = {
        model: STRUCTURED_MODEL,
        messages: [
            { role: "system", content: prompt },
            { role: "user", content: `File: ${fileName}\n\n${text.slice(0, MAX_EXTRACTED_CHARS)}` },
        ],
    };
    if (!STRUCTURED_MODEL.startsWith("gpt-5") && !STRUCTURED_MODEL.startsWith("o1")) {
        completionPayload.temperature = 0.1;
    }

    const completion = await completionWithTracing(ctx, completionPayload, {
        projectId,
        runId: "file-extract"
    });

    const raw = (completion as any).choices[0]?.message?.content ?? "";
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return {
            topics: Array.isArray(parsed.topics) ? parsed.topics : undefined,
            domain: typeof parsed.domain === "string" ? parsed.domain : undefined,
            entities: Array.isArray(parsed.entities) ? parsed.entities : undefined,
            summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
            facts: Array.isArray(parsed.facts) ? parsed.facts : undefined,
            language: typeof parsed.language === "string" ? parsed.language : undefined,
            model: STRUCTURED_MODEL,
            updatedAt: Date.now(),
        };
    } catch {
        return null;
    }
}
