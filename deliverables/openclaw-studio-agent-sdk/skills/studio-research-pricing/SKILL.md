---
name: studio-research-pricing
description: Research materials, vendors, and pricing with cited web results for Studio work. Use when the user asks for product sourcing, pricing checks, supplier research, or market lookups.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["TAVILY_API_KEY"] } } }
---

# Studio Research Pricing

1. Search with the bridge:

```bash
node ./bridge/studio-bridge.mjs web.search '{"query":"PVC board supplier Israel 5mm","maxResults":5}'
```

2. Return compact findings with titles and links.
3. Prefer actionable sourcing facts:
   - unit price
   - source url
   - supplier name
   - lead-time or stock note
4. Feed the result back into free chat or planning only when it changes the project decision.
