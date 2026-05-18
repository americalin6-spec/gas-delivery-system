"use client";

import type { CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import { followUpWorkspaceCopy } from "../lib/followUpWorkspaceI18n";
import type { WorkspaceCustomerRow } from "../lib/followUpWorkspace";
import type { CopyWithFallbackOptions } from "../hooks/useCopyWithFallback";
import { WorkspaceCustomerCard } from "./WorkspaceCustomerCard";
import { useWorkspaceFollowUpActions } from "./WorkspaceFollowUpModals";

export function WorkspaceCategoryList({
  rows,
  lang,
  isMobile,
  onRefresh,
  copyWithFallback,
}: {
  rows: WorkspaceCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
  onRefresh: () => void;
  copyWithFallback: (text: string, options?: CopyWithFallbackOptions) => Promise<boolean>;
}) {
  const labels = followUpWorkspaceCopy(lang);
  const { openComplete, openPostpone, modals } = useWorkspaceFollowUpActions(lang, onRefresh);

  return (
    <>
      {rows.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 15 }}>{labels.empty}</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          {rows.map((row) => (
            <WorkspaceCustomerCard
              key={String(row.id)}
              row={row}
              lang={lang}
              isMobile={isMobile}
              onComplete={openComplete}
              onPostpone={openPostpone}
              copyWithFallback={copyWithFallback}
            />
          ))}
        </div>
      )}
      {modals}
    </>
  );
}
