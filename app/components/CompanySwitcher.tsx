"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppLang } from "../lib/appLang";
import {
  getClientCompanyId,
  setClientCompanyId,
  useCurrentCompanyId,
} from "../lib/clientCompany";
import { supabase } from "../../supabase";

type CompanyRow = {
  id: number;
  name: string;
};

function copy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    title: zh ? "公司切換（多租戶）" : "Company switcher (multi-tenant)",
    subtitle: zh
      ? "選擇現在要操作的公司，所有 CRM 資料會自動只讀寫該公司。"
      : "Select the active company. All CRM reads and writes scope to it.",
    activeLabel: zh ? "目前公司" : "Active company",
    createLabel: zh ? "新增公司" : "Create a new company",
    namePlaceholder: zh ? "公司名稱" : "Company name",
    create: zh ? "新增" : "Create",
    creating: zh ? "新增中…" : "Creating…",
    refresh: zh ? "重新整理" : "Refresh",
    loadError: zh ? "讀取公司列表失敗" : "Failed to load companies",
    createError: zh ? "新增公司失敗" : "Failed to create company",
    needName: zh ? "請輸入公司名稱" : "Please enter a name",
    switched: (name: string) => (zh ? `已切換到「${name}」` : `Switched to "${name}"`),
    created: (name: string) => (zh ? `已建立「${name}」` : `Created "${name}"`),
    reloadHint: zh
      ? "切換公司後請重新整理目前頁面，或回到首頁。"
      : "Reload the current page (or go home) after switching.",
  };
}

export function CompanySwitcher({
  lang,
  isMobile,
}: {
  lang: AppLang;
  isMobile: boolean;
}) {
  const t = copy(lang);
  const activeId = useCurrentCompanyId();
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("companies")
      .select("id, name")
      .order("id", { ascending: true });
    if (error) {
      console.error("[CompanySwitcher] load failed:", error);
      setError(error.message || t.loadError);
      setRows([]);
    } else {
      setRows((data ?? []) as CompanyRow[]);
    }
    setLoading(false);
  }, [t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelect = (id: number) => {
    setClientCompanyId(id);
    const name = rows.find((r) => r.id === id)?.name ?? String(id);
    setStatus(t.switched(name));
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setError(t.needName);
      return;
    }
    setError(null);
    setStatus(null);
    setCreating(true);
    const { data, error } = await supabase
      .from("companies")
      .insert({ name })
      .select("id, name")
      .maybeSingle();
    setCreating(false);
    if (error || !data) {
      console.error("[CompanySwitcher] create failed:", error);
      setError(error?.message || t.createError);
      return;
    }
    const created = data as CompanyRow;
    setRows((prev) => [...prev, created]);
    setNewName("");
    setStatus(t.created(created.name));
    setClientCompanyId(created.id);
  };

  return (
    <section
      style={{
        background: "rgba(15,23,42,0.55)",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 14,
        padding: isMobile ? 18 : 22,
        marginBottom: isMobile ? 22 : 28,
      }}
    >
      <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>{t.title}</h2>
      <p style={{ margin: "0 0 14px", opacity: 0.78, fontSize: 13, lineHeight: 1.5 }}>
        {t.subtitle}
      </p>

      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>
          {t.activeLabel}{" "}
          <span style={{ opacity: 0.65, fontWeight: 500 }}>
            (id: {getClientCompanyId()})
          </span>
        </span>
        <select
          value={activeId}
          onChange={(e) => handleSelect(Number(e.target.value))}
          disabled={loading}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.4)",
            background: "#0f2744",
            color: "white",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {rows.length === 0 ? (
            <option value={activeId}>#{activeId}</option>
          ) : (
            rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} (#{row.id})
              </option>
            ))
          )}
        </select>
      </label>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "stretch",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t.namePlaceholder}
          style={{
            flex: 1,
            padding: "11px 14px",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.4)",
            background: "#0f2744",
            color: "white",
            fontSize: 15,
          }}
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          style={{
            padding: "11px 16px",
            borderRadius: 10,
            border: "1px solid rgba(99,102,241,0.5)",
            background: "rgba(99,102,241,0.25)",
            color: "white",
            fontSize: 15,
            fontWeight: 700,
            cursor: creating ? "not-allowed" : "pointer",
            opacity: creating || !newName.trim() ? 0.6 : 1,
          }}
        >
          {creating ? t.creating : t.create}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            padding: "11px 16px",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.4)",
            background: "transparent",
            color: "rgba(226,232,240,0.85)",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {t.refresh}
        </button>
      </div>

      {error ? (
        <p style={{ margin: "12px 0 0", color: "#fecaca", fontSize: 13 }}>{error}</p>
      ) : null}
      {status ? (
        <p style={{ margin: "12px 0 0", color: "#86efac", fontSize: 13 }}>
          {status} · {t.reloadHint}
        </p>
      ) : null}
    </section>
  );
}
