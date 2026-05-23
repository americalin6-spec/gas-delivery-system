"use client";

import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useAppLang } from "../hooks/useAppLang";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import { pipelineBoardCopy } from "../lib/customersI18n";
import {
  buildConversationSourceMap,
  resolveDisplayImportantDate,
} from "../lib/crmCustomerDisplay";
import { localizeCrmDisplayText } from "../lib/crmAiDisplayLabels";
import {
  boardColumnToCustomerStatus,
  customerStatusToBoardColumn,
  PIPELINE_BOARD_COLUMNS,
  pipelineBoardColumnLabel,
  pipelineBoardColumnVisual,
  type PipelineBoardColumn,
} from "../lib/pipelineBoardColumns";
import {
  buildPipelineCardTags,
  formatColumnAmountTotal,
  parseEstimatedAmountValue,
} from "../lib/pipelineKanban";
import {
  formatCustomerCreatedAtDisplay,
  getCustomerLastContactAt,
} from "../lib/customerSoftDelete";
import { formatWorkspaceDateTime } from "../lib/followUpWorkspace";
import {
  computeCustomerStatusStats,
  customerStatusLabel,
  customerStatusWritePayload,
  getRawCustomerStatus,
  normalizeCustomerStatus,
  type CustomerStatus,
} from "../lib/customerStatus";
import {
  loadCollapsedPipelineColumns,
  saveCollapsedPipelineColumns,
} from "../lib/pipelineColumnCollapse";
import {
  activeCustomersOnly,
  softDeleteCustomerPayload,
} from "../lib/customerSoftDelete";
import { logActiveCompany } from "../lib/clientCompany";
import { useActiveCompany } from "../components/ActiveCompanyProvider";
import { supabase } from "../../supabase";

const MOBILE_MAX = 768;

const CRM_THEME = {
  pageBg: "linear-gradient(135deg,#001133 0%,#001a44 40%,#003b46 100%)",
  panelBg: "#081b33",
  cardBg: "#102742",
  cardBorder: "rgba(148,163,184,0.18)",
  cardBorderStrong: "#1e3a5f",
  inputBg: "#102742",
  text: "#f8fafc",
  textMuted: "rgba(226,232,240,0.75)",
  textSubtle: "#94a3b8",
  accent: "#6366f1",
  shadow: "0 8px 24px rgba(0,0,0,0.25)",
  shadowSoft: "0 4px 16px rgba(0,0,0,0.2)",
} as const;

type PipelineCustomer = {
  id: string | number;
  customer_name?: string | null;
  company_name?: string | null;
  customer_status?: string | null;
  status?: string | null;
  note?: string | null;
  important_date?: string | null;
  estimated_amount?: string | null;
  success_rate?: string | null;
  priority?: string | null;
  urgent?: boolean | null;
  customer_level?: string | null;
  created_at?: string | null;
  last_contacted_at?: string | null;
  last_contact_at?: string | null;
};

function cardDragId(id: string | number) {
  return `card:${id}`;
}

function parseCardDragId(id: string): string | null {
  if (!id.startsWith("card:")) return null;
  return id.slice(5);
}

function isBoardColumnId(id: string): id is PipelineBoardColumn {
  return (PIPELINE_BOARD_COLUMNS as string[]).includes(id);
}

export default function PipelineBoardPage() {
  const { lang } = useAppLang();
  const isMobile = useIsViewportBelow(MOBILE_MAX);
  const t = pipelineBoardCopy(lang);

  const [customers, setCustomers] = useState<PipelineCustomer[]>([]);
  const [conversationSourceByCustomerId, setConversationSourceByCustomerId] = useState(
    () => new Map<string, string>(),
  );
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [columnFilter, setColumnFilter] = useState<"all" | PipelineBoardColumn>("all");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<PipelineBoardColumn>>(
    () => new Set(),
  );
  const { companyId, ready: companyReady } = useActiveCompany();

  useEffect(() => {
    setCollapsedColumns(loadCollapsedPipelineColumns());
  }, []);

  const toggleColumnCollapsed = useCallback((column: PipelineBoardColumn) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(column)) next.delete(column);
      else next.add(column);
      saveCollapsedPipelineColumns(next);
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const loadCustomers = useCallback(async () => {
    if (!companyReady || companyId <= 0) return;
    logActiveCompany("pipeline.load", { companyId });
    setLoading(true);

    const { data, error: loadError } = await supabase
      .from("customers")
      .select(
          "id, customer_name, company_name, customer_status, status, note, important_date, estimated_amount, success_rate, priority, urgent, customer_level, created_at, last_contacted_at, last_contact_at",
      )
      .eq("company_id", companyId)
      .order("id", { ascending: false });

    if (loadError) {
      console.error("[pipeline] load customers failed:", loadError);
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const rows = (data || []) as PipelineCustomer[];
    setCustomers(rows);

    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      setConversationSourceByCustomerId(new Map());
      setLoading(false);
      return;
    }

    const { data: convRows, error: convError } = await supabase
      .from("conversations")
      .select("customer_id, message_text")
      .eq("company_id", companyId)
      .in("customer_id", ids)
      .order("id", { ascending: true });

    if (convError) {
      console.warn("[pipeline] load conversations failed:", convError);
      setConversationSourceByCustomerId(new Map());
    } else {
      setConversationSourceByCustomerId(
        buildConversationSourceMap(convRows || []),
      );
    }

    setLoading(false);
  }, [companyId, companyReady]);

  useEffect(() => {
    if (!companyReady || companyId <= 0) return;
    void loadCustomers();
  }, [loadCustomers, companyReady, companyId]);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (columnFilter !== "all") {
        const col = customerStatusToBoardColumn(getRawCustomerStatus(c));
        if (col !== columnFilter) return false;
      }
      if (!keyword) return true;
      const haystack = [
        c.customer_name,
        c.company_name,
        c.note,
        c.success_rate,
        c.estimated_amount,
      ]
        .map((v) => (v || "").toString().toLowerCase())
        .join(" ");
      return haystack.includes(keyword);
    });
  }, [customers, search, columnFilter]);

  const stats = useMemo(() => computeCustomerStatusStats(filteredCustomers), [filteredCustomers]);

  const grouped = useMemo(() => {
    const out = new Map<PipelineBoardColumn, PipelineCustomer[]>();
    for (const col of PIPELINE_BOARD_COLUMNS) out.set(col, []);
    for (const c of filteredCustomers) {
      const col = customerStatusToBoardColumn(getRawCustomerStatus(c));
      out.get(col)!.push(c);
    }
    return out;
  }, [filteredCustomers]);

  const columnMeta = useMemo(() => {
    const meta = new Map<
      PipelineBoardColumn,
      { count: number; amountTotal: number; amountLabel: string }
    >();
    for (const col of PIPELINE_BOARD_COLUMNS) {
      const rows = grouped.get(col) || [];
      const amountTotal = rows.reduce(
        (sum, r) => sum + parseEstimatedAmountValue(r.estimated_amount),
        0,
      );
      meta.set(col, {
        count: rows.length,
        amountTotal,
        amountLabel: formatColumnAmountTotal(amountTotal, lang),
      });
    }
    return meta;
  }, [grouped, lang]);

  const updateStatus = useCallback(
    async (customerId: string | number, next: CustomerStatus) => {
      const current = customers.find((c) => String(c.id) === String(customerId));
      if (!current) return;
      if (normalizeCustomerStatus(getRawCustomerStatus(current)) === next) return;

      const prevSnapshot = customers;
      setUpdatingId(String(customerId));
      setError(null);

      setCustomers((rows) =>
        rows.map((r) =>
          String(r.id) === String(customerId)
            ? { ...r, ...customerStatusWritePayload(next) }
            : r,
        ),
      );

      const { error: updateError } = await supabase
        .from("customers")
        .update(customerStatusWritePayload(next))
        .eq("company_id", companyId)
        .eq("id", customerId);

      setUpdatingId(null);

      if (updateError) {
        console.error("[pipeline] update status failed:", updateError);
        setError(updateError.message || t.updateFailed);
        setCustomers(prevSnapshot);
      }
    },
    [customers, companyId, t.updateFailed],
  );

  const moveToBoardColumn = useCallback(
    (customerId: string | number, column: PipelineBoardColumn) => {
      void updateStatus(customerId, boardColumnToCustomerStatus(column));
    },
    [updateStatus],
  );

  const deleteCustomer = useCallback(
    async (id: string | number) => {
      if (!confirm(t.confirmDelete)) return;
      const { error: deleteError } = await supabase
        .from("customers")
        .update(softDeleteCustomerPayload())
        .eq("company_id", companyId)
        .eq("id", id);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      setCustomers((rows) => rows.filter((r) => String(r.id) !== String(id)));
    },
    [companyId, t.confirmDelete],
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const customerId = parseCardDragId(String(active.id));
    if (!customerId) return;

    const overId = String(over.id);
    let targetCol: PipelineBoardColumn | null = null;
    if (isBoardColumnId(overId)) {
      targetCol = overId;
    } else {
      const overCardId = parseCardDragId(overId);
      if (overCardId) {
        const overCustomer = customers.find((c) => String(c.id) === overCardId);
        if (overCustomer) {
          targetCol = customerStatusToBoardColumn(getRawCustomerStatus(overCustomer));
        }
      }
    }

    if (targetCol) moveToBoardColumn(customerId, targetCol);
  };

  const activeCustomer = useMemo(() => {
    const id = activeDragId ? parseCardDragId(activeDragId) : null;
    if (!id) return null;
    return customers.find((c) => String(c.id) === id) ?? null;
  }, [activeDragId, customers]);

  const font =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  return (
    <main
      style={{
        minHeight: "100vh",
        background: CRM_THEME.pageBg,
        padding: isMobile ? 20 : 40,
        color: CRM_THEME.text,
        fontFamily: font,
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        lineHeight: 1.5,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "center",
          flexDirection: isMobile ? "column" : "row",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: isMobile ? 34 : 46,
              margin: 0,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: CRM_THEME.text,
            }}
          >
            {t.title}
          </h1>
          <p style={{ color: CRM_THEME.textMuted, marginTop: 10, fontSize: isMobile ? 16 : 18 }}>
            {t.subtitle(filteredCustomers.length)}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            width: isMobile ? "100%" : "auto",
          }}
        >
          <Link href="/customers" style={{ width: isMobile ? "100%" : "auto" }}>
            <button style={navButton(isMobile)}>{t.backCustomers}</button>
          </Link>
          <Link href="/" style={{ width: isMobile ? "100%" : "auto" }}>
            <button style={navButtonSecondary(isMobile)}>{t.backHome}</button>
          </Link>
        </div>
      </header>

      <StatsSummary
        total={stats.total}
        won={stats.won}
        lost={stats.lost}
        conversionRate={stats.conversionRate}
        labels={t}
        isMobile={isMobile}
      />

      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 12,
          marginTop: 18,
          marginBottom: 14,
        }}
      >
        <input
          placeholder={t.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: isMobile ? "14px 16px" : "16px 18px",
            borderRadius: 14,
            border: "none",
            background: CRM_THEME.inputBg,
            color: CRM_THEME.text,
            fontSize: 16,
            boxSizing: "border-box",
            minWidth: 0,
          }}
        />
        <select
          value={columnFilter}
          onChange={(e) =>
            setColumnFilter(e.target.value as "all" | PipelineBoardColumn)
          }
          aria-label={t.filterAll}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${CRM_THEME.cardBorder}`,
            background: CRM_THEME.inputBg,
            color: CRM_THEME.text,
            fontSize: 14,
            fontWeight: 600,
            minWidth: isMobile ? "100%" : 180,
          }}
        >
          <option value="all">{t.filterAll}</option>
          {PIPELINE_BOARD_COLUMNS.map((col) => (
            <option key={col} value={col}>
              {pipelineBoardColumnLabel(col, lang)}
            </option>
          ))}
        </select>
      </div>

      <p style={{ color: CRM_THEME.textMuted, fontSize: 14, marginBottom: 16 }}>{t.dragHint}</p>

      {error ? (
        <div
          role="alert"
          style={{
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(248,113,113,0.35)",
            color: "#fecaca",
            padding: 12,
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: CRM_THEME.textMuted, padding: 24 }}>…</div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <style>{`
            .pipeline-board-grid {
              display: grid;
              gap: 14px;
              grid-template-columns: minmax(0, 1fr);
              align-items: start;
            }
            @media (min-width: 768px) {
              .pipeline-board-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
            }
            @media (min-width: 1024px) {
              .pipeline-board-grid {
                grid-template-columns: repeat(4, minmax(0, 1fr));
              }
            }
          `}</style>
          <div className="pipeline-board-grid">
            {PIPELINE_BOARD_COLUMNS.map((col) => (
              <KanbanColumn
                key={col}
                column={col}
                rows={grouped.get(col) || []}
                meta={columnMeta.get(col)!}
                lang={lang}
                t={t}
                collapsed={collapsedColumns.has(col)}
                onToggleCollapsed={() => toggleColumnCollapsed(col)}
                conversationSourceByCustomerId={conversationSourceByCustomerId}
                onMove={moveToBoardColumn}
                onDelete={deleteCustomer}
                updatingId={updatingId}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2,0,0,1)" }}>
            {activeCustomer ? (
              <PipelineCardView
                customer={activeCustomer}
                lang={lang}
                t={t}
                conversationSource={conversationSourceByCustomerId.get(String(activeCustomer.id)) ?? ""}
                isDragging
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </main>
  );
}

function navButton(isMobile: boolean): CSSProperties {
  return {
    background: CRM_THEME.accent,
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

function navButtonSecondary(isMobile: boolean): CSSProperties {
  return {
    background: CRM_THEME.cardBg,
    color: "white",
    border: `1px solid ${CRM_THEME.cardBorderStrong}`,
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
    { label: labels.statsWon, value: String(won), color: "#4ade80" },
    { label: labels.statsLost, value: String(lost), color: "#f87171" },
    {
      label: labels.statsConversion,
      value: `${(conversionRate * 100).toFixed(1)}%`,
      helper: labels.statsConversionHelp,
      color: "#818cf8",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            background: "rgba(15,23,42,0.6)",
            border: `1px solid ${CRM_THEME.cardBorder}`,
            borderRadius: 14,
            padding: isMobile ? 14 : 18,
            boxShadow: CRM_THEME.shadowSoft,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: CRM_THEME.textMuted,
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              fontSize: isMobile ? 24 : 32,
              fontWeight: 700,
              color: card.color,
              marginTop: 6,
              lineHeight: 1.1,
            }}
          >
            {card.value}
          </div>
          {card.helper ? (
            <div style={{ fontSize: 11, color: CRM_THEME.textSubtle, marginTop: 4 }}>
              {card.helper}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function KanbanColumn({
  column,
  rows,
  meta,
  lang,
  t,
  collapsed,
  onToggleCollapsed,
  conversationSourceByCustomerId,
  onMove,
  onDelete,
  updatingId,
}: {
  column: PipelineBoardColumn;
  rows: PipelineCustomer[];
  meta: { count: number; amountTotal: number; amountLabel: string };
  lang: ReturnType<typeof useAppLang>["lang"];
  t: ReturnType<typeof pipelineBoardCopy>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  conversationSourceByCustomerId: Map<string, string>;
  onMove: (id: string | number, col: PipelineBoardColumn) => void;
  onDelete: (id: string | number) => void;
  updatingId: string | null;
}) {
  const v = pipelineBoardColumnVisual(column);
  const { setNodeRef, isOver } = useDroppable({ id: column });

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 0,
        width: "100%",
        background: isOver ? "#1a3557" : CRM_THEME.panelBg,
        border: `1px solid ${isOver ? v.dropRing : CRM_THEME.cardBorder}`,
        borderRadius: 14,
        boxShadow: isOver
          ? `0 0 0 2px ${v.dropRing}, ${CRM_THEME.shadow}`
          : CRM_THEME.shadowSoft,
        display: "flex",
        flexDirection: "column",
        maxHeight: collapsed ? undefined : "min(520px, calc(100vh - 240px))",
        transition: "border-color 180ms ease, box-shadow 180ms ease, max-height 200ms ease",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: collapsed ? "none" : `1px solid ${CRM_THEME.cardBorder}`,
          background: v.headerBg,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: collapsed ? 14 : undefined,
          borderBottomRightRadius: collapsed ? 14 : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapsed();
            }}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t.expandColumn : t.collapseColumn}
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: 8,
              border: `1px solid ${CRM_THEME.cardBorder}`,
              background: "rgba(15,23,42,0.45)",
              color: CRM_THEME.text,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: v.accent,
              flexShrink: 0,
            }}
          />
          <strong
            style={{
              fontSize: 14,
              color: CRM_THEME.text,
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {pipelineBoardColumnLabel(column, lang)}
          </strong>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: CRM_THEME.text,
              background: "rgba(15,23,42,0.4)",
              border: `1px solid ${CRM_THEME.cardBorder}`,
              padding: "2px 8px",
              borderRadius: 999,
              flexShrink: 0,
            }}
          >
            {t.columnCount(meta.count)}
          </span>
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: CRM_THEME.textMuted,
            paddingLeft: 36,
          }}
        >
          {t.columnAmount}:{" "}
          <span style={{ fontWeight: 700, color: v.accent }}>{meta.amountLabel}</span>
        </div>
      </div>

      {!collapsed ? (
        <div
          style={{
            flex: 1,
            minHeight: 120,
            overflowY: "auto",
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {rows.length === 0 ? (
            <div style={{ color: CRM_THEME.textSubtle, fontSize: 13, padding: "8px 4px" }}>
              {t.emptyColumn}
            </div>
          ) : (
            rows.map((c) => (
              <DraggablePipelineCard
                key={String(c.id)}
                customer={c}
                lang={lang}
                t={t}
                conversationSource={conversationSourceByCustomerId.get(String(c.id)) ?? ""}
                onMove={onMove}
                onDelete={onDelete}
                busy={updatingId === String(c.id)}
              />
            ))
          )}
        </div>
      ) : isOver ? (
        <div
          style={{
            padding: "10px 14px 12px",
            fontSize: 12,
            color: CRM_THEME.textSubtle,
            fontStyle: "italic",
          }}
        >
          {t.emptyColumn}
        </div>
      ) : null}
    </div>
  );
}

function DraggablePipelineCard({
  customer,
  lang,
  t,
  conversationSource,
  onMove,
  onDelete,
  busy,
}: {
  customer: PipelineCustomer;
  lang: ReturnType<typeof useAppLang>["lang"];
  t: ReturnType<typeof pipelineBoardCopy>;
  conversationSource: string;
  onMove: (id: string | number, col: PipelineBoardColumn) => void;
  onDelete: (id: string | number) => void;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: cardDragId(customer.id),
    disabled: busy,
  });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : busy ? 0.7 : 1,
    transition: isDragging ? undefined : "opacity 160ms ease, transform 160ms ease",
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <PipelineCardView
        customer={customer}
        lang={lang}
        t={t}
        conversationSource={conversationSource}
        onMove={onMove}
        onDelete={onDelete}
        busy={busy}
        isDragging={isDragging}
      />
    </div>
  );
}

function PipelineCardView({
  customer,
  lang,
  t,
  conversationSource,
  onMove,
  onDelete,
  busy,
  isDragging,
  isOverlay,
}: {
  customer: PipelineCustomer;
  lang: ReturnType<typeof useAppLang>["lang"];
  t: ReturnType<typeof pipelineBoardCopy>;
  conversationSource: string;
  onMove?: (id: string | number, col: PipelineBoardColumn) => void;
  onDelete?: (id: string | number) => void;
  busy?: boolean;
  isDragging?: boolean;
  isOverlay?: boolean;
}) {
  const status = normalizeCustomerStatus(getRawCustomerStatus(customer));
  const currentColumn = customerStatusToBoardColumn(getRawCustomerStatus(customer));
  const importantDate = resolveDisplayImportantDate(
    conversationSource,
    lang,
    new Date(),
    customer.important_date,
  );
  const note = customer.note?.trim();
  const tags = buildPipelineCardTags(customer);
  const score = customer.success_rate?.trim();

  return (
    <article
      style={{
        background: CRM_THEME.cardBg,
        borderRadius: 12,
        padding: "12px 12px 10px",
        border: isOverlay
          ? `1px solid ${CRM_THEME.accent}`
          : isDragging
            ? "1px dashed rgba(129,140,248,0.65)"
            : `1px solid ${CRM_THEME.cardBorderStrong}`,
        boxShadow: isOverlay ? CRM_THEME.shadow : CRM_THEME.shadowSoft,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        cursor: busy ? "wait" : "grab",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: CRM_THEME.text,
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
              fontSize: 12,
              color: CRM_THEME.textMuted,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {customer.company_name}
          </div>
        ) : null}
        {(() => {
          const createdLabel = formatCustomerCreatedAtDisplay(customer.created_at, lang);
          const lastAt = getCustomerLastContactAt(customer);
          return (
            <>
              {createdLabel ? (
                <div style={{ fontSize: 11, color: CRM_THEME.textSubtle, marginTop: 2 }}>
                  {t.createdAtLabel}：{createdLabel}
                </div>
              ) : null}
              <div style={{ fontSize: 11, color: CRM_THEME.textSubtle, marginTop: 2 }}>
                {t.lastContactLabel}：
                {lastAt ? formatWorkspaceDateTime(lastAt, lang) : "—"}
              </div>
            </>
          );
        })()}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(30,58,95,0.65)",
            color: "#bfdbfe",
            border: "1px solid rgba(96,165,250,0.35)",
          }}
        >
          {customerStatusLabel(status, lang)}
        </span>
        {score ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(99,102,241,0.25)",
              color: "#c7d2fe",
              border: "1px solid rgba(129,140,248,0.4)",
            }}
          >
            {t.aiScore} {localizeCrmDisplayText(score)}
          </span>
        ) : null}
        {customer.urgent ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(239,68,68,0.22)",
              color: "#fecaca",
              border: "1px solid rgba(248,113,113,0.4)",
            }}
          >
            {t.urgent}
          </span>
        ) : customer.priority === "high" ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(249,115,22,0.22)",
              color: "#fed7aa",
              border: "1px solid rgba(251,146,60,0.4)",
            }}
          >
            {t.highPriority}
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.45 }}>
        <span style={{ fontWeight: 700, color: CRM_THEME.textMuted }}>{t.latestNote}: </span>
        {note || t.noNote}
      </div>

      <div style={{ fontSize: 12, color: "#cbd5e1" }}>
        <span style={{ fontWeight: 700, color: CRM_THEME.textMuted }}>{t.importantDate}: </span>
        {importantDate || t.noImportantDate}
      </div>

      {customer.estimated_amount?.trim() ? (
        <div style={{ fontSize: 12, fontWeight: 700, color: "#facc15" }}>
          {customer.estimated_amount}
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 6,
              background: "rgba(6,25,47,0.6)",
              border: `1px solid ${CRM_THEME.cardBorderStrong}`,
              color: CRM_THEME.textSubtle,
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {onMove || onDelete ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 2,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Link href={`/customers/${customer.id}`}>
            <button
              type="button"
              style={{
                background: "rgba(34,197,94,0.16)",
                color: "#86efac",
                border: "1px solid rgba(74,222,128,0.35)",
                padding: "5px 10px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {t.openCustomer}
            </button>
          </Link>
          {onMove ? (
            <select
              value={currentColumn}
              disabled={busy}
              onChange={(e) =>
                onMove(customer.id, e.target.value as PipelineBoardColumn)
              }
              aria-label={t.moveTo}
              style={{
                flex: "1 1 100px",
                minWidth: 0,
                background: "rgba(15,23,42,0.85)",
                color: CRM_THEME.text,
                border: `1px solid ${CRM_THEME.cardBorder}`,
                borderRadius: 8,
                padding: "5px 8px",
                fontSize: 11,
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {PIPELINE_BOARD_COLUMNS.map((col) => (
                <option key={col} value={col}>
                  {pipelineBoardColumnLabel(col, lang)}
                </option>
              ))}
            </select>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(customer.id)}
              style={{
                background: "rgba(239,68,68,0.18)",
                color: "#fecaca",
                border: "1px solid rgba(248,113,113,0.35)",
                padding: "5px 10px",
                borderRadius: 8,
                cursor: busy ? "not-allowed" : "pointer",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {t.deleteCustomer}
            </button>
          ) : null}
          {busy ? (
            <span style={{ fontSize: 11, color: CRM_THEME.textSubtle }}>{t.updating}</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
