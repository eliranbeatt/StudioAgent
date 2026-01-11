export async function searchWeb(query: string) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        console.error("Missing TAVILY_API_KEY");
        return { error: "Search unavailable (configuration error)" };
    }

    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                api_key: apiKey,
                query: query,
                search_depth: "basic",
                include_answer: true,
                max_results: 5,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("Tavily search failed:", response.status, text);
            return { error: `Search failed: ${response.statusText}` };
        }

        const data = await response.json();

        // Simplify the output for the LLM
        const results = (data.results || []).map((r: any) => ({
            title: r.title,
            url: r.url,
            content: r.content,
        }));

        return {
            answer: data.answer,
            results: results,
        };
    } catch (e: any) {
        console.error("Web search exception:", e);
        return { error: e.message };
    }
}
