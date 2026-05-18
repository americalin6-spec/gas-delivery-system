import {
  dedupeByCustomerId,
  filterDueToday,
  filterHighDeal,
  filterOverdue,
  filterRecent,
  type WorkspaceCustomerRow,
} from "./followUpWorkspace";

export type WorkspaceCategorySlug = "today" | "overdue" | "high-probability" | "recent";

export const WORKSPACE_CATEGORY_SLUGS: WorkspaceCategorySlug[] = [
  "today",
  "overdue",
  "high-probability",
  "recent",
];

export function isWorkspaceCategorySlug(value: string): value is WorkspaceCategorySlug {
  return (WORKSPACE_CATEGORY_SLUGS as string[]).includes(value);
}

export function workspaceCategoryPath(slug: WorkspaceCategorySlug): string {
  return `/workspace/${slug}`;
}

export function getWorkspaceCategoryRows(
  slug: WorkspaceCategorySlug,
  rows: WorkspaceCustomerRow[],
): WorkspaceCustomerRow[] {
  let filtered: WorkspaceCustomerRow[];
  switch (slug) {
    case "today":
      filtered = filterDueToday(rows);
      break;
    case "overdue":
      filtered = filterOverdue(rows);
      break;
    case "high-probability":
      filtered = filterHighDeal(rows);
      break;
    case "recent":
      filtered = filterRecent(rows);
      break;
    default:
      filtered = [];
  }
  return dedupeByCustomerId(filtered);
}
