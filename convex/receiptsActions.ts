"use node"

import { action } from './_generated/server'
import { api } from './_generated/api'
import { v } from 'convex/values'
import OpenAI from 'openai'
import pdfParse from 'pdf-parse'

const RECEIPT_MODEL = 'gpt-5.2'

type ReceiptLine = {
  name: string
  qty?: number | null
  unit?: string | null
  unitPrice?: number | null
  total?: number | null
}

type ReceiptExtraction = {
  vendorName?: string | null
  date?: string | null
  total?: number | null
  currency?: string | null
  lineItems?: ReceiptLine[]
}

export const analyzeReceipt = action({
  args: { receiptId: v.id('receipts') },
  handler: async (ctx, { receiptId }) => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured')
    }

    const result = await ctx.runQuery(api.receipts.getReceiptWithFile, { receiptId })
    if (!result?.receipt) throw new Error('Receipt not found')
    if (!result.file) throw new Error('Receipt file not found')
    const { receipt, file: receiptFile } = result

    const blob = await ctx.storage.get(receiptFile.storageId)
    if (!blob) throw new Error('Receipt storage file not found')

    let extractedText = ''
    if (receiptFile.contentType?.includes('pdf') || receiptFile.fileName?.endsWith('.pdf')) {
      const buffer = Buffer.from(await blob.arrayBuffer())
      const pdf = await pdfParse(buffer)
      extractedText = pdf.text
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const prompt = [
      'You are extracting structured data from a receipt.',
      'Return JSON only with this schema:',
      '{',
      '  "vendorName": string | null,',
      '  "date": string | null,',
      '  "total": number | null,',
      '  "currency": string | null,',
      '  "lineItems": [',
      '    { "name": string, "qty": number | null, "unit": string | null, "unitPrice": number | null, "total": number | null }',
      '  ]',
      '}',
      'If unsure about a field, return null.',
    ].join('\n')

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: prompt },
    ]

    if (extractedText) {
      messages.push({
        role: 'user',
        content: `Receipt text:\n${extractedText.slice(0, 12000)}`,
      })
    } else if (receiptFile.contentType?.startsWith('image/')) {
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Extract receipt data from this image.' },
          {
            type: 'image_url',
            image_url: {
              url: `data:${receiptFile.contentType};base64,${base64}`,
            },
          },
        ],
      })
    } else {
      throw new Error('Unsupported receipt file type')
    }

    const completion = await client.chat.completions.create({
      model: RECEIPT_MODEL,
      messages,
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    let parsed: ReceiptExtraction | null = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }

    const extraction = parsed ?? { lineItems: [] }
    const items = (extraction.lineItems ?? []).map((line) => ({
      nameRaw: line.name ?? 'Item',
      qty: typeof line.qty === 'number' ? line.qty : undefined,
      unit: line.unit ?? undefined,
      unitPrice: typeof line.unitPrice === 'number' ? line.unitPrice : undefined,
      total: typeof line.total === 'number' ? line.total : undefined,
    }))

    await ctx.runMutation(api.receipts.updateReceipt, {
      receiptId,
      status: 'extracted',
      total: typeof extraction.total === 'number' ? extraction.total : undefined,
      currency: extraction.currency ?? undefined,
      extraction,
    })

    if (items.length > 0) {
      await ctx.runMutation(api.receipts.upsertReceiptItems, {
        receiptId,
        items,
      })
    }

    return { ok: true, extractedItems: items.length }
  },
})
