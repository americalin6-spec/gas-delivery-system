import "server-only";

import { createHmac, createHash, timingSafeEqual } from "crypto";
import type { RecurringPaidPlan } from "./billingSettings";
import {
  getEcpayCheckoutPlanDefinition,
  type RecurringPlanDefinition,
} from "./billingSettings";

export type EcpayEnvironment = "staging" | "production";

export type EcpayFullConfig = {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  returnUrl: string;
  clientBackUrl: string;
  env: EcpayEnvironment;
};

const LAUNCH_TOKEN_TTL_MS = 15 * 60 * 1000;

/** ECPay AioCheckOut V5 gateway (supports periodic params). */
export function getAioCheckOutGatewayUrl(env: EcpayEnvironment): string {
  return env === "production"
    ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
    : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";
}

export function readEcpayFullConfig(): EcpayFullConfig | null {
  const merchantId = process.env.ECPAY_MERCHANT_ID?.trim();
  const hashKey = process.env.ECPAY_HASH_KEY?.trim();
  const hashIv = process.env.ECPAY_HASH_IV?.trim();
  const returnUrl = process.env.ECPAY_RETURN_URL?.trim();
  const clientBackUrl = process.env.ECPAY_CLIENT_BACK_URL?.trim();
  if (!merchantId || !hashKey || !hashIv || !returnUrl || !clientBackUrl) {
    return null;
  }
  const env =
    process.env.ECPAY_ENV?.trim() === "production" ? "production" : "staging";
  return {
    merchantId,
    hashKey,
    hashIv,
    returnUrl,
    clientBackUrl,
    env,
  };
}

export function isEcpayCheckoutConfigured(): boolean {
  return readEcpayFullConfig() !== null;
}

/** Derive period notify URL from payment ReturnURL when only one env is set. */
export function derivePeriodReturnUrl(returnUrl: string): string {
  if (returnUrl.includes("/api/ecpay/callback")) {
    return returnUrl.replace("/api/ecpay/callback", "/api/ecpay/period-callback");
  }
  const base = returnUrl.replace(/\/$/, "");
  return `${base}/api/ecpay/period-callback`;
}

/** ECPay CheckMacValue (EncryptType 1 / SHA256). */
export function generateCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIv: string,
): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== "CheckMacValue" && params[k] !== undefined && params[k] !== "")
    .sort();
  const paramStr = sorted.map((k) => `${k}=${params[k]}`).join("&");
  const raw = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIv}`;
  const encoded = dotNetUrlEncode(raw);
  return createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

function dotNetUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .toLowerCase()
    .replace(/%20/g, "+")
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");
}

export function formatEcpayMerchantTradeDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/** Unique trade no (max 20 chars per ECPay). */
export function createMerchantTradeNo(companyId: number): string {
  const suffix = Date.now().toString(36).slice(-7).toUpperCase();
  const prefix = `LW${companyId}`.slice(0, 12);
  return `${prefix}${suffix}`.slice(0, 20);
}

export type EcpayLaunchPayload = {
  gatewayUrl: string;
  fields: Record<string, string>;
};

function signLaunchPayload(payload: object, hashKey: string): string {
  const body = JSON.stringify(payload);
  const sig = createHmac("sha256", hashKey).update(body).digest("base64url");
  return Buffer.from(JSON.stringify({ body, sig }), "utf8").toString("base64url");
}

function verifyLaunchPayload<T extends object>(
  token: string,
  hashKey: string,
): T | null {
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      body?: string;
      sig?: string;
    };
    if (!parsed.body || !parsed.sig) return null;
    const expected = createHmac("sha256", hashKey).update(parsed.body).digest("base64url");
    const a = Buffer.from(parsed.sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(parsed.body) as T & { exp?: number };
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function buildSubscriptionCheckoutFields(params: {
  config: EcpayFullConfig;
  companyId: number;
  userId: string;
  plan: RecurringPaidPlan;
  catalog: RecurringPlanDefinition;
  merchantTradeNo: string;
}): Record<string, string> {
  const { config, companyId, userId, plan, catalog, merchantTradeNo } = params;
  const amount = String(catalog.ecpayPeriodAmount);
  const itemName = catalog.nameZh.slice(0, 50);
  const tradeDesc = `${catalog.nameZh} 月訂閱`.slice(0, 200);

  const fields: Record<string, string> = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: formatEcpayMerchantTradeDate(),
    PaymentType: "aio",
    TotalAmount: amount,
    TradeDesc: tradeDesc,
    ItemName: itemName,
    ReturnURL: config.returnUrl,
    ClientBackURL: config.clientBackUrl,
    ChoosePayment: "Credit",
    EncryptType: "1",
    PeriodAmount: amount,
    PeriodType: "M",
    Frequency: "1",
    ExecTimes: String(catalog.ecpayExecTimes),
    PeriodReturnURL: derivePeriodReturnUrl(config.returnUrl),
    CustomField1: String(companyId),
    CustomField2: plan,
    CustomField3: userId,
    CustomField4: "subscription",
  };

  fields.CheckMacValue = generateCheckMacValue(fields, config.hashKey, config.hashIv);
  return fields;
}

export function createSubscriptionEcpayCheckout(params: {
  config: EcpayFullConfig;
  companyId: number;
  userId: string;
  plan: RecurringPaidPlan;
  catalog: RecurringPlanDefinition;
  launchOrigin: string;
}): { redirectUrl: string; merchantTradeNo: string; gatewayUrl: string } {
  const merchantTradeNo = createMerchantTradeNo(params.companyId);
  const fields = buildSubscriptionCheckoutFields({
    config: params.config,
    companyId: params.companyId,
    userId: params.userId,
    plan: params.plan,
    catalog: params.catalog,
    merchantTradeNo,
  });
  const gatewayUrl = getAioCheckOutGatewayUrl(params.config.env);
  const token = signLaunchPayload(
    {
      exp: Date.now() + LAUNCH_TOKEN_TTL_MS,
      gatewayUrl,
      fields,
    },
    params.config.hashKey,
  );
  const launchUrl = new URL("/api/ecpay/launch", params.launchOrigin);
  launchUrl.searchParams.set("token", token);
  return {
    redirectUrl: launchUrl.toString(),
    merchantTradeNo,
    gatewayUrl,
  };
}

export function verifyEcpayLaunchToken(token: string): EcpayLaunchPayload | null {
  const config = readEcpayFullConfig();
  if (!config) return null;
  const data = verifyLaunchPayload<{
    exp: number;
    gatewayUrl: string;
    fields: Record<string, string>;
  }>(token, config.hashKey);
  if (!data?.gatewayUrl || !data.fields) return null;
  return { gatewayUrl: data.gatewayUrl, fields: data.fields };
}

export function buildEcpayLaunchHtml(payload: EcpayLaunchPayload): string {
  const inputs = Object.entries(payload.fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>導向綠界付款</title>
</head>
<body>
  <p>正在導向綠界安全付款頁面，請稍候…</p>
  <form id="ecpay" method="post" action="${escapeHtml(payload.gatewayUrl)}">
    ${inputs}
  </form>
  <script>document.getElementById("ecpay").submit();</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Validate plan id against server catalog (starter / professional only). */
export function resolveEcpaySubscriptionCheckoutPlan(
  plan: string,
): { plan: RecurringPaidPlan; catalog: RecurringPlanDefinition } | { error: string } {
  const normalized = plan.trim().toLowerCase();
  if (normalized === "enterprise") {
    return { error: "企業方案請聯絡業務開通" };
  }
  const catalog = getEcpayCheckoutPlanDefinition(normalized);
  if (!catalog) {
    return { error: "請選擇個人方案或專業方案" };
  }
  if (catalog.ecpayPeriodAmount <= 0) {
    return { error: "方案價格尚未設定" };
  }
  return { plan: catalog.plan, catalog };
}
