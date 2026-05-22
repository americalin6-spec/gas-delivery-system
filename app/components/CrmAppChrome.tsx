"use client";

import type { ReactNode } from "react";
import { CrmNotificationBell } from "./CrmNotificationBell";

/** Global CRM chrome: fixed notification bell on all pages. */
export function CrmAppChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <CrmNotificationBell />
      {children}
    </>
  );
}
