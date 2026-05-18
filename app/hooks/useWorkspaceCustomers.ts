"use client";

import { useCallback, useEffect, useState } from "react";
import { WORKSPACE_CUSTOMER_SELECT, type WorkspaceCustomerRow } from "../lib/followUpWorkspace";
import { supabase } from "../../supabase";

export function useWorkspaceCustomers() {
  const [rows, setRows] = useState<WorkspaceCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select(WORKSPACE_CUSTOMER_SELECT)
        .order("created_at", { ascending: false })
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, loadError, refresh };
}
