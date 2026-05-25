"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useActiveCompany } from "../components/ActiveCompanyProvider";
import { useAuthSession } from "./useAuthSession";
import { logActiveCompany } from "../lib/clientCompany";
import { activeCustomersOnly } from "../lib/customerSoftDelete";
import { WORKSPACE_CUSTOMER_SELECT, type WorkspaceCustomerRow } from "../lib/followUpWorkspace";
import { canQueryTenantCustomers } from "../lib/tenantClientAuth";
import { supabase } from "../../supabase";

export function useWorkspaceCustomers() {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuthSession();
  const { companyId, ready: companyReady } = useActiveCompany();
  const [rows, setRows] = useState<WorkspaceCustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (
      authLoading ||
      !canQueryTenantCustomers({
        sessionUserId: user?.id,
        companyId,
        companyReady,
        pathname,
      })
    ) {
      setRows([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      logActiveCompany("workspaceCustomers.load", { companyId });
      const { data, error } = await activeCustomersOnly(
        supabase
          .from("customers")
          .select(WORKSPACE_CUSTOMER_SELECT)
          .eq("company_id", companyId),
      )
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(500);

      if (error) {
        setRows([]);
        setLoadError(error.message);
      } else {
        setRows((data ?? []) as WorkspaceCustomerRow[]);
      }
    } catch {
      setRows([]);
      setLoadError("load failed");
    }
    setLoading(false);
  }, [authLoading, companyId, companyReady, pathname, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, loadError, refresh, companyId, companyReady };
}
