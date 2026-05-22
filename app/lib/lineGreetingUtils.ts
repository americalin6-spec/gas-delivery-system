import { resolveCustomerHonorific } from "./customerHonorific";

export type LineGreetingCustomerInput = {
  customer_name?: string | null;
};

const GREETING_OPENER_RE =
  /^(?:[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9.'-]{0,18})?(?:您好|哈囉|Hi|Hello)[，,]\s*/iu;

/** Remove a leading greeting (with optional name prefix) so we can add exactly one. */
export function stripLeadingGreeting(text: string): string {
  return text.trim().replace(GREETING_OPENER_RE, "").trim();
}

/** Collapse duplicated greeting openers such as「您好，您好」or「Lin您好，您好」. */
export function dedupeGreetingPrefix(text: string): string {
  let t = text.trim();
  t = t.replace(/^(.+?您好)[，,]\s*您好[，,]\s*/u, "$1，");
  t = t.replace(/^您好[，,]\s*您好[，,]\s*/u, "您好，");
  return t;
}

/**
 * Prepend exactly one greeting: `{name}您好，` or `您好，`.
 * Body must not include its own「您好」— only the message after the greeting.
 */
export function prefixCustomerGreeting(
  customer: LineGreetingCustomerInput,
  body: string,
): string {
  const core = stripLeadingGreeting(body);
  if (!core) return dedupeGreetingPrefix(body.trim());

  const { addressName } = resolveCustomerHonorific({
    customerName: customer.customer_name,
    lang: "zh",
  });

  const opener = addressName ? `${addressName}您好` : "您好";
  return dedupeGreetingPrefix(`${opener}，${core}`);
}
