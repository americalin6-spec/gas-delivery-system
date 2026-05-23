/** Normalize LINE @id for CRM fields and UI — strips label prefixes, never returns bare「ID：」. */

const LINE_ID_LABEL_PREFIX_RE =
  /^(?:LINE\s*ID|LINE\s*帳號|LINE|line\s*id|ID)\s*[：:]\s*/iu;

const LINE_ID_LABEL_ONLY_RE = /^(?:LINE\s*ID|LINE\s*帳號|LINE|line\s*id|ID)\s*[：:]?\s*$/iu;

export function normalizeLineIdForDisplay(value: string | null | undefined): string {
  let s = String(value ?? "").trim();
  if (!s || s === "--" || s === "-") return "";

  if (LINE_ID_LABEL_ONLY_RE.test(s)) return "";

  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(LINE_ID_LABEL_PREFIX_RE, "").trim();
    s = s.replace(/^[：:]\s*/, "").trim();
  }

  s = s.replace(/^@+/, "").trim();

  if (!s || LINE_ID_LABEL_ONLY_RE.test(s)) return "";
  return s;
}

/** Speaker name before colon that indicates the content is a LINE ID value. */
export const LINE_ID_FIELD_SPEAKER_RE =
  /^(?:LINE\s*ID|LINE\s*帳號|LINE|line\s*id|ID)$/iu;
