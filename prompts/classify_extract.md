Open one source file and return structured extraction data.

You must inspect the file as a receipt, invoice, or bill classifier and extractor.

Return one JSON object only with this schema:

{
  "documentType": "receipt" | "invoice" | "bill" | null,
  "classificationReason": string,
  "supplierNameRaw": string | null,
  "supplierNameNormalized": string | null,
  "supplierTaxId": string | null,
  "documentNumber": string | null,
  "issueDateRaw": string | null,
  "issueDate": string | null,
  "dueDateRaw": string | null,
  "dueDate": string | null,
  "currencyRaw": string | null,
  "currency": "ILS" | "USD" | "EUR" | null,
  "subtotal": number | null,
  "taxAmount": number | null,
  "discountAmount": number | null,
  "shippingAmount": number | null,
  "totalAmount": number | null,
  "paymentMethod": string | null,
  "paymentReference": string | null,
  "categoryPrimary": string | null,
  "categorySecondary": string | null,
  "languageHint": string | null,
  "confidenceScore": number,
  "confidenceLevel": "high" | "medium" | "low",
  "flags": string[],
  "notes": string | null,
  "lineItems": [
    {
      "lineIndex": number,
      "descriptionRaw": string,
      "descriptionNormalized": string | null,
      "sku": string | null,
      "unitRaw": string | null,
      "unitNormalized": string | null,
      "quantity": number | null,
      "unitPrice": number | null,
      "lineSubtotal": number | null,
      "taxRate": number | null,
      "taxAmount": number | null,
      "lineTotal": number | null,
      "categoryPrimary": string | null,
      "categorySecondary": string | null,
      "confidenceScore": number,
      "confidenceLevel": "high" | "medium" | "low",
      "flags": string[]
    }
  ]
}

Rules:
- Use only visible evidence.
- Use null for unknown values.
- Keep raw text exact where possible.
- Use ISO YYYY-MM-DD only when the date is fully readable.
- If totals conflict, add total_mismatch.
- If the image contains more than one expense document, add multiple_documents.
- If the document is not a receipt, invoice, or bill, set documentType to null and add non_expense_document.
- Allowed Categories: wood_sheet_goods, hardware_fasteners, paint_finishes, printing_graphics, fabric_textiles, foam_plastics, metal_materials, glass_acrylic, electrical_lighting, rental_equipment, transport_delivery, labor_external, tools_consumables, office_admin, food_hospitality, cleaning_maintenance, software_services, misc_uncategorized.
- Do not output markdown.
- Do not explain outside the JSON object.
