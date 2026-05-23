/** CRM social / web contact columns on `customers`. */
export const CUSTOMER_SOCIAL_FIELD_KEYS = [
  "instagram",
  "facebook",
  "tiktok",
  "xiaohongshu",
  "youtube",
  "website",
  "alternate_contact",
] as const;

export type CustomerSocialFieldKey = (typeof CUSTOMER_SOCIAL_FIELD_KEYS)[number];

export type CustomerSocialFields = Partial<
  Record<CustomerSocialFieldKey, string | null | undefined>
>;

export const CUSTOMER_SOCIAL_LABELS_ZH: Record<CustomerSocialFieldKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  xiaohongshu: "小紅書",
  youtube: "YouTube",
  website: "官方網站",
  alternate_contact: "備用聯絡方式",
};

export const CUSTOMER_SOCIAL_OPEN_LABELS_ZH: Partial<
  Record<CustomerSocialFieldKey, string>
> = {
  instagram: "開啟 Instagram",
  facebook: "開啟 Facebook",
  tiktok: "開啟 TikTok",
  website: "開啟官方網站",
  youtube: "開啟 YouTube",
  xiaohongshu: "開啟小紅書",
};

function stripAt(handle: string): string {
  return handle.trim().replace(/^@+/, "");
}

function ensureHttps(url: string): string {
  const t = url.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.includes(".");
}

/** Resolve external profile URL for link buttons (null = show plain text only). */
export function resolveSocialHref(
  field: CustomerSocialFieldKey,
  raw: string | null | undefined,
): string | null {
  const t = String(raw ?? "").trim();
  if (!t || t === "-" || t === "—") return null;

  if (/^https?:\/\//i.test(t)) return t;

  switch (field) {
    case "instagram":
      return `https://www.instagram.com/${stripAt(t)}`;
    case "facebook":
      if (t.includes("facebook.com") || t.includes("fb.com")) return ensureHttps(t);
      return `https://www.facebook.com/${stripAt(t)}`;
    case "tiktok":
      if (t.includes("tiktok.com")) return ensureHttps(t);
      return `https://www.tiktok.com/@${stripAt(t)}`;
    case "youtube":
      if (t.includes("youtube.com") || t.includes("youtu.be")) return ensureHttps(t);
      return `https://www.youtube.com/@${stripAt(t)}`;
    case "xiaohongshu":
      if (
        t.includes("xiaohongshu.com") ||
        t.includes("xhslink.com") ||
        looksLikeUrl(t)
      ) {
        return ensureHttps(t);
      }
      return null;
    case "website":
      return ensureHttps(t);
    case "alternate_contact":
      if (looksLikeUrl(t)) return ensureHttps(t);
      return null;
    default:
      return null;
  }
}

export function socialFieldHasValue(raw: string | null | undefined): boolean {
  const t = String(raw ?? "").trim();
  return Boolean(t && t !== "-" && t !== "—");
}
