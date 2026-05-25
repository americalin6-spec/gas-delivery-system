"use client";

import { usePathname } from "next/navigation";
import { isPublicPath } from "../lib/authRoutes";

/** True on /, /login, /signup, /pricing, /auth/callback, etc. */
export function useIsPublicMarketingRoute(): boolean {
  const pathname = usePathname();
  if (!pathname?.length) return true;
  return isPublicPath(pathname);
}
