const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const runId = "run_2026_03_16_002";
const workspaceDir = "C:\\Users\\elira\\Dev\\StudioAgent\\Recipts";
const ledgerDir = path.join(workspaceDir, "ledger");
const docsDir = path.join(workspaceDir, "documents");
const runsDir = path.join(workspaceDir, "runs", runId);

function processReceipt(sourceFilePath, recordId, rawResponseStr) {
    const fileName = path.basename(sourceFilePath);
    const fileBuffer = fs.readFileSync(sourceFilePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const fileSha256 = hashSum.digest('hex');

    // Check duplicates
    const expensesPath = path.join(ledgerDir, "expenses.jsonl");
    if (fs.existsSync(expensesPath)) {
        const lines = fs.readFileSync(expensesPath, 'utf8').split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const entry = JSON.parse(line);
                if (entry.fileSha256 === fileSha256) {
                    console.log(`Duplicate found for ${fileName}`);
                    fs.renameSync(sourceFilePath, path.join(workspaceDir, "rejected", fileName));
                    return;
                }
            } catch (e) {}
        }
    }

    const rawResponse = JSON.parse(rawResponseStr);
    
    // Determine target folder
    let targetFolder = "accepted";
    let reviewStatus = "accepted";
    if (rawResponse.flags && rawResponse.flags.length > 0) {
        targetFolder = "flagged";
        reviewStatus = "flagged";
    }
    if (rawResponse.documentType === null || rawResponse.flags.includes("non_expense_document") || rawResponse.flags.includes("unreadable_document")) {
        targetFolder = "rejected";
        reviewStatus = "rejected";
    }

    const targetPath = path.join(workspaceDir, targetFolder, fileName);
    const sourceRelativePath = `${targetFolder}/${fileName}`;

    // 1. Raw response
    fs.writeFileSync(path.join(docsDir, `${recordId}.raw_response.json`), JSON.stringify(rawResponse, null, 2));

    // 2. Document JSON
    const docJson = {
        recordId,
        sourceFileName: fileName,
        ...rawResponse
    };
    delete docJson.lineItems;
    fs.writeFileSync(path.join(docsDir, `${recordId}.document.json`), JSON.stringify(docJson, null, 2));

    // 3. Lines JSON
    const linesJson = {
        recordId,
        lineItems: rawResponse.lineItems || []
    };
    fs.writeFileSync(path.join(docsDir, `${recordId}.lines.json`), JSON.stringify(linesJson, null, 2));

    // 4. Review JSON
    const reviewJson = {
        recordId,
        reviewStatus,
        reviewRequired: targetFolder === "flagged",
        reviewReasons: rawResponse.flags || [],
        operatorNotes: null,
        corrections: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(docsDir, `${recordId}.review.json`), JSON.stringify(reviewJson, null, 2));

    // 5. Append to expenses.jsonl
    if (targetFolder === "accepted" || targetFolder === "flagged") {
        const expenseEntry = {
            recordId,
            sourceFileName: fileName,
            sourceRelativePath,
            fileSha256,
            ingestionRunId: runId,
            documentType: rawResponse.documentType,
            reviewStatus,
            confidenceScore: rawResponse.confidenceScore,
            confidenceLevel: rawResponse.confidenceLevel,
            flags: rawResponse.flags || [],
            languageHint: rawResponse.languageHint,
            supplierNameRaw: rawResponse.supplierNameRaw,
            supplierNameNormalized: rawResponse.supplierNameNormalized,
            supplierTaxId: rawResponse.supplierTaxId,
            documentNumber: rawResponse.documentNumber,
            issueDateRaw: rawResponse.issueDateRaw,
            issueDate: rawResponse.issueDate,
            dueDateRaw: rawResponse.dueDateRaw,
            dueDate: rawResponse.dueDate,
            currencyRaw: rawResponse.currencyRaw,
            currency: rawResponse.currency,
            subtotal: rawResponse.subtotal,
            taxAmount: rawResponse.taxAmount,
            discountAmount: rawResponse.discountAmount,
            shippingAmount: rawResponse.shippingAmount,
            totalAmount: rawResponse.totalAmount,
            paymentMethod: rawResponse.paymentMethod,
            paymentReference: rawResponse.paymentReference,
            categoryPrimary: rawResponse.categoryPrimary,
            categorySecondary: rawResponse.categorySecondary,
            notes: rawResponse.notes,
            lineItemCount: (rawResponse.lineItems || []).length,
            ocrTextPath: `documents/${recordId}.document.json`,
            rawResponsePath: `documents/${recordId}.raw_response.json`,
            documentJsonPath: `documents/${recordId}.document.json`,
            linesJsonPath: `documents/${recordId}.lines.json`,
            reviewJsonPath: `documents/${recordId}.review.json`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        fs.appendFileSync(expensesPath, JSON.stringify(expenseEntry) + '\n');

        // 6. Append to expense_line_items.jsonl
        const linesPath = path.join(ledgerDir, "expense_line_items.jsonl");
        let lineIdx = 1;
        for (const line of (rawResponse.lineItems || [])) {
            const lineEntry = {
                lineItemId: `line_${recordId}_${String(lineIdx).padStart(2, '0')}`,
                recordId,
                ...line,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            fs.appendFileSync(linesPath, JSON.stringify(lineEntry) + '\n');
            lineIdx++;
        }
    }

    // Move file
    fs.renameSync(sourceFilePath, targetPath);

    // 8. Append to run_summary.jsonl
    const summaryEntry = {
        runId,
        sourceFileName: fileName,
        recordId,
        outcome: targetFolder,
        reason: targetFolder === "accepted" ? "High-confidence extraction" : (targetFolder === "rejected" ? "Rejected document" : "Flagged for review"),
        flags: rawResponse.flags || [],
        createdAt: new Date().toISOString()
    };
    fs.appendFileSync(path.join(runsDir, "run_summary.jsonl"), JSON.stringify(summaryEntry) + '\n');

    // 9. Update manifest.json
    const manifestPath = path.join(runsDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.counts.processed++;
    if (targetFolder === "accepted") manifest.counts.accepted++;
    if (targetFolder === "flagged") manifest.counts.flagged++;
    if (targetFolder === "rejected") manifest.counts.rejected++;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`Successfully processed ${fileName} -> ${targetFolder}`);
}

const args = process.argv.slice(2);
if (args.length >= 3) {
    const sourceFile = args[0];
    const recordId = args[1];
    const rawJsonStr = args[2].endsWith('.json') ? fs.readFileSync(args[2], 'utf8') : args.slice(2).join(' ');
    processReceipt(sourceFile, recordId, rawJsonStr);
}
