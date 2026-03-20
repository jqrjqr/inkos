/**
 * Web search + URL fetch utilities.
 *
 * searchWeb(): Provider-independent web search via DuckDuckGo HTML (no API key needed).
 * fetchUrl(): Fetch a specific URL and return plain text.
 */

export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

/**
 * Search the web via DuckDuckGo HTML. No API key required.
 * Returns up to `maxResults` results with title, url, snippet.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<ReadonlyArray<SearchResult>> {
  const encodedQuery = encodeURIComponent(query);
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "text/html",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo search failed: ${res.status}`);
  }

  const html = await res.text();
  const results: SearchResult[] = [];

  // Parse DuckDuckGo HTML results — each result is in a <div class="result">
  const resultBlocks = html.split(/class="result(?:\s|")/);
  for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
    const block = resultBlocks[i]!;

    // Extract URL from <a class="result__a" href="...">
    const urlMatch = block.match(/href="([^"]+)"[^>]*class="result__a"|class="result__a"[^>]*href="([^"]+)"/);
    const rawUrl = urlMatch?.[1] ?? urlMatch?.[2] ?? "";

    // DuckDuckGo wraps URLs in redirects — extract actual URL
    const actualUrlMatch = rawUrl.match(/uddg=([^&]+)/);
    const url = actualUrlMatch ? decodeURIComponent(actualUrlMatch[1]!) : rawUrl;

    if (!url || url.startsWith("/") || !url.startsWith("http")) continue;

    // Extract title
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/);
    const title = titleMatch?.[1]?.trim() ?? "";

    // Extract snippet from <a class="result__snippet">
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)(?:<\/a>|<\/td>)/);
    const snippet = snippetMatch?.[1]
      ?.replace(/<[^>]*>/g, "")
      ?.replace(/\s+/g, " ")
      ?.trim() ?? "";

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

/**
 * Fetch a URL and return its text content.
 * HTML is stripped to plain text. Output is truncated to maxChars.
 */
export async function fetchUrl(url: string, maxChars = 8000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "text/html, application/json, text/plain",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  // If HTML, strip tags and collapse whitespace
  if (contentType.includes("html")) {
    return text
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxChars);
  }

  return text.slice(0, maxChars);
}
