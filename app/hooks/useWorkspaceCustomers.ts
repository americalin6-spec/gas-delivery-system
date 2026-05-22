"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveCompany } from "../components/ActiveCompanyProvider";
import { logActiveCompany } from "../lib/clientCompany";
import { activeCustomersOnly } from "../lib/customerSoftDelete";
import { WORKSPACE_CUSTOMER_SELECT, type WorkspaceCustomerRow } from "../lib/followUpWorkspace";
import { supabase } from "../../supabase";

export function useWorkspaceCustomers() {
  const { companyId, ready: companyReady } = useActiveCompany();
  const [rows, setRows] = useState<WorkspaceCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyReady || companyId <= 0) {
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
  }, [companyId, companyReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, loadError, refresh, companyId, companyReady };
}
