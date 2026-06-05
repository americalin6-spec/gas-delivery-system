export type AiFetchKind = "summary" | "follow-up";

export async function postAiCustomerEndpoint<T>(params: {
  kind: AiFetchKind;
  endpoint: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
}): Promise<{ ok: true; data: T } | { ok: false; error: string; aborted?: boolean }> {
  const { kind, endpoint, body, signal } = params;
  console.log("[AI] fetch start", kind);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = (await res.json()) as T & { ok?: boolean; error?: string };
    if (!res.ok || !(data as { ok?: boolean }).ok) {
      const err = (data as { error?: string }).error || `無法取得 AI (${kind})`;
      return { ok: false, error: err };
    }
    console.log("[AI] fetch complete", kind);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "aborted", aborted: true };
    }
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: "aborted", aborted: true };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : `AI 請求失敗 (${kind})`,
    };
  }
}

export function shouldSkipDuplicateAiRequest(inFlight: boolean, kind: AiFetchKind): boolean {
  if (!inFlight) return false;
  console.log("[AI] skipped duplicate request", kind);
  return true;
}
