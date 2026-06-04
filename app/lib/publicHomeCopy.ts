import type { AppLang } from "./appLang";

/** Marketing-only copy for public "/" — no CRM workspace or customer-list wording. */
export function publicHomeCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    brand: "智能分析與成交管理平台",
    title: zh ? "智能分析與成交管理平台" : "LINE AI Sales Assistant",
    subtitle: zh
      ? "把客戶對話變成客戶洞察、成交建議與專業回覆"
      : "Turn customer conversations into insights, deal guidance, and professional replies",
    feature1Title: zh ? "AI 分析客戶對話" : "AI customer conversation analysis",
    feature1Desc: zh
      ? "貼上對話即可擷取重點、成交洞察與回覆建議。"
      : "Paste chats for key insights and reply suggestions.",
    feature2Title: zh ? "登入後完整 CRM" : "Full CRM after sign-in",
    feature2Desc: zh
      ? "客戶列表、分析與儲存功能在登入後的儀表板使用。"
      : "Customer list, analysis, and save live in your dashboard after login.",
    feature3Title: zh ? "免費試用 30 天" : "30-day free trial",
    feature3Desc: zh
      ? "立即註冊體驗，無需信用卡即可開始。"
      : "Sign up to start — no credit card required.",
    ctaTrial: zh ? "免費試用" : "Try free",
    ctaPricing: zh ? "查看方案與定價" : "View pricing",
    emailSignIn: zh ? "使用電子郵件登入" : "Sign in with email",
    emailSignUp: zh ? "使用電子郵件註冊" : "Sign up with email",
  };
}
