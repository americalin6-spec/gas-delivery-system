/** Strip optional markdown code fences from LLM output. */
function stripMarkdownCodeFence(text: string): string {
  let t = text.trim();
  if (!t.startsWith("```")) return t;
  t = t.replace(/^```(?:json|JSON)?\s*\n?/i, "");
  t = t.replace(/\n?```\s*$/i, "");
  return t.trim();
}

function tryParseObject(candidate: string): Record<string, unknown> | null {
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Parse JSON from OpenAI message content (raw JSON or ```json fenced blocks).
 */
export function parseAiJsonObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const candidates: string[] = [];
  const fenceRe = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(text)) !== null) {
    const body = match[1]?.trim();
    if (body) candidates.push(body);
  }

  candidates.push(stripMarkdownCodeFence(text));

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    candidates.push(text.slice(start, end + 1));
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const parsed = tryParseObject(key);
    if (parsed) return parsed;
  }

  return null;
}
