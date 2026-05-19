"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { useAppLang } from "../hooks/useAppLang";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import { pipelineBoardCopy } from "../lib/customersI18n";
import {
  formatFollowUpDateDisplay,
  getFollowUpBadge,
  getTaipeiTodayYmd,
  diffCalendarDaysYmd,
  normalizeFollowUpDateValue,
} from "../lib/followUpReminders";
import {
  computePipelineStats,
  normalizePipelineStatus,
  PIPELINE_STATUSES,
  pipelineStatusLabel,
  pipelineStatusVisual,
  type PipelineStatus,
} from "../lib/pipelineStatus";
import PipelineStatusBadge from "../components/PipelineStatusBadge";
import { logActiveCompany } from "../lib/clientCompany";
import { useActiveCompany } from "../components/ActiveCompanyProvider";
import { supabase } from "../../supabase";

const MOBILE_MAX = 768;

type PipelineCustomer = {
  id: string | number;
  customer_name?: string | null;
  company_name?: string | null;
  status?: string | null;
  follow_up_date?: string | null;
  estimated_amount?: string | null;
  success_rate?: string | null;
};

export default function PipelineBoardPage() {
  const { lang } = useAppLang();
  const isMobile = useIsViewportBelow(MOBILE_MAX);
  const t = pipelineBoardCopy(lang);

  const [customers, setCustomers] = useState<PipelineCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<PipelineStatus | null>(null);
  const { companyId, ready: companyReady } = useActiveCompany();

  const loadCustomers = useCallback(async () => {
    if (!companyReady || companyId <= 0) return;
    logActiveCompany("pipeline.load", { companyId });
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, customer_name, company_name, status, follow_up_date, estimated_amount, success_rate",
      )
      .eq("company_id", companyId)
      .order("id", { ascending: false });

    if (error) {
      console.error("[pipeline] load customers failed:", error);
      setError(error.message);
      return;
    }
    setCustomers((data || []) as PipelineCustomer[]);
    setLoading(false);
  }, [companyId, companyReady]);

  useEffect(() => {
    if (!companyReady || companyId <= 0) return;
    void loadCustomers();
  }, [loadCustomers, companyReady, companyId]);

  const stats = useMemo(() => computePipelineStats(customers), [customers]);

  const grouped = useMemo(() => {
    const out = new Map<PipelineStatus, PipelineCustomer[]>();
    for (const s of PIPELINE_STATUSES) out.set(s, []);
    for (const c of customers) {
      const s = normalizePipelineStatus(c.status);
      out.get(s)!.push(c);
    }
    return out;
  }, [customers]);

  const updateStatus = useCallback(
    async (customerId: string | number, next: PipelineStatus) => {
      const current = customers.find((c) => String(c.id) === String(customerId));
      if (!current) return;
      if (normalizePipelineStatus(current.status) === next) return;

      const prevSnapshot = customers;
      setUpdatingId(String(customerId));
      setError(null);

      setCustomers((rows) =>
        rows.map((r) =>
          String(r.id) === String(customerId) ? { ...r, status: next } : r,
        ),
      );

      const { error } = await supabase
        .from("customers")
        .update({ status: next })
        .eq("company_id", companyId)
        .eq("id", customerId);

      setUpdatingId(null);

      if (error) {
        console.error("[pipeline] update status failed:", error);
        setError(error.message || t.updateFailed);
        setCustomers(prevSnapshot);
      }
    },
    [customers, companyId, companyReady, t.updateFailed],
  );

  const handleDragStart = (
    e: DragEvent<HTMLDivElement>,
    customerId: string | number,
  ) => {
    e.dataTransfer.setData("text/plain", String(customerId));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, target: PipelineStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== target) setDragOver(target);
  };

  const handleDragLeave = (target: PipelineStatus) => {
    if (dragOver === target) setDragOver(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, target: PipelineStatus) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) void updateStatus(id, target);
  };

  const font =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg,#001133 0%,#001a44 40%,#003b46 100%)",
        padding: isMobile ? 20 : 40,
        color: "white",
        fontFamily: font,
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "center",
          flexDirection: isMobile ? "column" : "row",
          gap: 20,
          marginBottom: 28,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: isMobile ? 34 : 46,
              margin: 0,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            {t.title}
          </h1>
          <p style={{ opacity: 0.82, marginTop: 10, fontSize: 16 }}>
            {t.subtitle(customers.length)}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            width: isMobile ? "100%" : "auto",
          }}
        >
          <Link href="/customers" style={{ width: isMobile ? "100%" : "auto" }}>
            <button style={navButton(isMobile, "#102742")}>{t.backCustomers}</button>
          </Link>
          <Link href="/" style={{ width: isMobile ? "100%" : "auto" }}>
            <button style={navButton(isMobile, "#081b33")}>{t.backHome}</button>
          </Link>
        </div>
      </div>

      <StatsSummary
        total={stats.total}
        won={stats.won}
        lost={stats.lost}
        conversionRate={stats.conversionRate}
        labels={t}
        isMobile={isMobile}
      />

      <p
        style={{
          opacity: 0.7,
          fontSize: 14,
          marginTop: 18,
          marginBottom: 18,
        }}
      >
        {t.dragHint}
      </p>

      {error ? (
        <div
          role="alert"
          style={{
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(248,113,113,0.35)",
            color: "#fecaca",
            padding: 14,
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ opacity: 0.7, padding: 24 }}>…</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(6, minmax(260px, 1fr))",
            gap: 16,
            overflowX: isMobile ? "visible" : "auto",
            paddingBottom: 8,
          }}
        >
          {PIPELINE_STATUSES.map((s) => {
            const v = pipelineStatusVisual(s);
            const rows = grouped.get(s) || [];
            const isOver = dragOver === s;
            return (
              <div
                key={s}
                onDragOver={(e) => handleDragOver(e, s)}
                onDragLeave={() => handleDragLeave(s)}
                onDrop={(e) => handleDrop(e, s)}
                style={{
                  background: isOver ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.55)",
                  border: `1px solid ${isOver ? v.columnAccent : "rgba(148,163,184,0.18)"}`,
                  borderRadius: 16,
                  padding: 14,
                  minHeight: 240,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  transition: "background 120ms ease, border-color 120ms ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    paddingBottom: 8,
                    borderBottom: `1px solid ${v.columnAccent}55`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: v.columnAccent,
                      }}
                    />
                    <strong style={{ fontSize: 15, letterSpacing: "-0.01em" }}>
                      {pipelineStatusLabel(s, lang)}
                    </strong>
                  </div>
                  <span style={{ fontSize: 13, opacity: 0.75 }}>{rows.length}</span>
                </div>

                {rows.length === 0 ? (
                  <div
                    style={{
                      opacity: 0.55,
                      fontSize: 13,
                      padding: "8px 4px",
                    }}
                  >
                    {t.emptyColumn}
                  </div>
                ) : (
                  rows.map((c) => (
                    <PipelineCard
                      key={String(c.id)}
                      customer={c}
                      currentStatus={s}
                      lang={lang}
                      t={t}
                      isMobile={isMobile}
                      onDragStart={handleDragStart}
                      onChangeStatus={updateStatus}
                      busy={updatingId === String(c.id)}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function navButton(isMobile: boolean, bg: string): CSSProperties {
  return {
    background: bg,
    color: "white",
    border: "none",
    padding: isMobile ? "13px 18px" : "13px 22px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 15,
    width: isMobile ? "100%" : "auto",
  };
}

function StatsSummary({
  total,
  won,
  lost,
  conversionRate,
  labels,
  isMobile,
}: {
  total: number;
  won: number;
  lost: number;
  conversionRate: number;
  labels: ReturnType<typeof pipelineBoardCopy>;
  isMobile: boolean;
}) {
  const cards: Array<{ label: string; value: string; helper?: string; color: string }> = [
    { label: labels.statsTotal, value: String(total), color: "#94a3b8" },
    { label: labels.statsWon, value: String(won), color: "#22c55e" },
    { label: labels.statsLost, value: String(lost), color: "#ef4444" },
    {
      label: labels.statsConversion,
      value: `${(conversionRate * 100).toFixed(1)}%`,
      helper: labels.statsConversionHelp,
      color: "#6366f1",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
        gap: 12,
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 14,
            padding: isMobile ? 14 : 18,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "rgba(226,232,240,0.75)",
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              fontSize: isMobile ? 26 : 34,
              fontWeight: 700,
              color: card.color,
              marginTop: 6,
              lineHeight: 1.1,
            }}
          >
            {card.value}
          </div>
          {card.helper ? (
            <div
              style={{
                fontSize: 12,
                opacity: 0.65,
                marginTop: 4,
              }}
            >
              {card.helper}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PipelineCard({
  customer,
  currentStatus,
  lang,
  t,
  isMobile,
  onDragStart,
  onChangeStatus,
  busy,
}: {
  customer: PipelineCustomer;
  currentStatus: PipelineStatus;
  lang: ReturnType<typeof useAppLang>["lang"];
  t: ReturnType<typeof pipelineBoardCopy>;
  isMobile: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string | number) => void;
  onChangeStatus: (id: string | number, next: PipelineStatus) => void;
  busy: boolean;
}) {
  const followYmd = normalizeFollowUpDateValue(customer.follow_up_date);
  const followBadge = followYmd ? getFollowUpBadge(followYmd) : "none";
  const todayYmd = getTaipeiTodayYmd();
  const diff = followYmd ? diffCalendarDaysYmd(todayYmd, followYmd) : null;

  return (
    <div
      draggable={!isMobile && !busy}
      onDragStart={(e) => onDragStart(e, customer.id)}
      style={{
        background: "#102742",
        borderRadius: 12,
        padding: 12,
        cursor: !isMobile && !busy ? "grab" : "default",
        opacity: busy ? 0.65 : 1,
        border: "1px solid rgba(148,163,184,0.18)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              lineHeight: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {customer.customer_name?.trim() || t.unnamed}
          </div>
          {customer.company_name?.trim() ? (
            <div
              style={{
                fontSize: 13,
                opacity: 0.7,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {customer.company_name}
            </div>
          ) : null}
        </div>
        <PipelineStatusBadge status={currentStatus} lang={lang} size="sm" />
      </div>

      {followYmd ? (
        <div
          style={{
            fontSize: 12,
            opacity: 0.85,
            color: followBadge === "overdue" ? "#fecaca" : "rgba(226,232,240,0.85)",
          }}
        >
          {t.followUpPrefix}：{formatFollowUpDateDisplay(followYmd, lang)}
          {diff != null ? (
            <span style={{ opacity: 0.65 }}>
              {" "}
              ({diff === 0 ? "D0" : diff > 0 ? `+${diff}d` : `${diff}d`})
            </span>
          ) : null}
        </div>
      ) : null}

      {customer.estimated_amount?.trim() ? (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {t.estimatedShort}：{customer.estimated_amount}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginTop: 4,
          flexWrap: "wrap",
        }}
      >
        <Link href={`/customers/${customer.id}`}>
          <button
            style={{
              background: "rgba(34,197,94,0.18)",
              color: "#86efac",
              border: "1px solid rgba(74,222,128,0.4)",
              padding: "6px 12px",
              borderRadius: 999,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {t.openCustomer}
          </button>
        </Link>
        <select
          value={currentStatus}
          disabled={busy}
          onChange={(e) => onChangeStatus(customer.id, e.target.value as PipelineStatus)}
          aria-label={t.moveTo}
          style={{
            background: "rgba(15,23,42,0.85)",
            color: "white",
            border: "1px solid rgba(148,163,184,0.3)",
            borderRadius: 8,
            padding: "6px 8px",
            fontSize: 12,
            fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {PIPELINE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {pipelineStatusLabel(s, lang)}
            </option>
          ))}
        </select>
        {busy ? (
          <span style={{ fontSize: 12, opacity: 0.7 }}>{t.updating}</span>
        ) : null}
      </div>
    </div>
  );
}
