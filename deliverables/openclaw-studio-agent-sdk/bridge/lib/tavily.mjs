import { requireTavilyKey } from './client.mjs'

export async function tavilySearch({
  query,
  maxResults = 5,
  topic = 'general',
  days = 30,
}) {
  const apiKey = requireTavilyKey()
  const normalizedQuery = String(query ?? '').trim()
  if (!normalizedQuery) {
    throw new Error('web.search requires a non-empty query')
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: normalizedQuery,
      topic,
      days,
      max_results: Math.max(1, Math.min(Number(maxResults ?? 5), 10)),
      include_answer: true,
      include_raw_content: false,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Tavily search failed: ${response.status} ${body}`)
  }

  const result = await response.json()
  const items = Array.isArray(result?.results) ? result.results : []

  return {
    ok: true,
    query: normalizedQuery,
    answer: String(result?.answer ?? '').trim() || null,
    results: items.map((item) => ({
      title: String(item?.title ?? '').trim(),
      url: String(item?.url ?? '').trim(),
      content: String(item?.content ?? '').trim(),
      score: Number(item?.score ?? 0),
    })),
  }
}
