import type { AppLang } from "./appLang";

export type HomeNavId =
  | "dashboard"
  | "customers"
  | "lineAnalysis"
  | "crm"
  | "tasks"
  | "calendar"
  | "alerts"
  | "quotes"
  | "replies";

export type HomeNavItem = {
  id: HomeNavId;
  labelZh: string;
  labelEn: string;
};

/** Primary navigation for general CRM users. */
export const CUSTOMER_HOME_NAV: HomeNavItem[] = [
  { id: "dashboard", labelZh: "儀表板", labelEn: "Dashboard" },
  { id: "customers", labelZh: "客戶列表", labelEn: "Customers" },
  { id: "lineAnalysis", labelZh: "LINE 分析", labelEn: "LINE Analysis" },
  { id: "crm", labelZh: "CRM 功能", labelEn: "CRM" },
];

/** Admin / developer tools — hidden unless internal nav is enabled. */
const INTERNAL_HOME_NAV: HomeNavItem[] = [
  { id: "tasks", labelZh: "待辦事項", labelEn: "Tasks" },
  { id: "calendar", labelZh: "行事曆", labelEn: "Calendar" },
  { id: "alerts", labelZh: "通知中心", labelEn: "Alerts" },
  { id: "quotes", labelZh: "報價追蹤", labelEn: "Quotes" },
  { id: "replies", labelZh: "AI 回覆庫", labelEn: "AI Replies" },
];

export function showInternalCrmNav(): boolean {
  return (
    process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV === "1" ||
    process.env.NEXT_PUBLIC_DEBUG_COMPANY === "1"
  );
}

const CUSTOMER_NAV_IDS = new Set(CUSTOMER_HOME_NAV.map((item) => item.id));

export function getHomeNavItems(lang: AppLang): { id: HomeNavId; label: string }[] {
  const items = showInternalCrmNav()
    ? [...CUSTOMER_HOME_NAV, ...INTERNAL_HOME_NAV]
    : CUSTOMER_HOME_NAV;
  return items.map((item) => ({
    id: item.id,
    label:
      CUSTOMER_NAV_IDS.has(item.id) || lang === "zh"
        ? item.labelZh
        : item.labelEn,
  }));
}
