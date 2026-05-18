import type { AppLang } from "./appLang";
import { followUpWorkspaceCopy } from "./followUpWorkspaceI18n";
import type { WorkspaceCategorySlug } from "./workspaceCategories";

export function workspaceCategoryTitle(slug: WorkspaceCategorySlug, lang: AppLang): string {
  const labels = followUpWorkspaceCopy(lang);
  switch (slug) {
    case "today":
      return labels.dueToday;
    case "overdue":
      return labels.overdue;
    case "high-probability":
      return labels.highDeal;
    case "recent":
      return labels.recent;
    default:
      return labels.title;
  }
}
