"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAppLang } from "../hooks/useAppLang";
import { tasksPageCopy, translateDisplayValue } from "../lib/uiI18n";
import { supabase } from "../supabase";

interface Customer {
  id: string | number;
  customer_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  line_id?: string | null;
  todo?: string | null;
  next_step?: string | null;
  follow_up?: string | null;
}

function hasContent(value?: string | null) {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed !== "-";
}

export default function TasksPage() {
  const { lang } = useAppLang();
  const t = tasksPageCopy(lang);
  const displayValue = (value?: string | null) => translateDisplayValue(value, lang);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, customer_name, company_name, phone, line_id, todo, next_step, follow_up"
      )
      .order("id", { ascending: false });

    if (error) {
      console.error(error);
      setCustomers([]);
    } else {
      setCustomers(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const taskCustomers = customers.filter(
    (c) =>
      hasContent(c.follow_up) || hasContent(c.todo) || hasContent(c.next_step)
  );

  async function copyFollowUp(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert(t.copiedFollowUp);
    } catch {
      alert(t.copyFailed);
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>{t.title}</h1>
          <p style={styles.subtitle}>{t.subtitle(taskCustomers.length, loading)}</p>
        </div>
        <Link href="/" style={styles.backLink}>
          {t.backHome}
        </Link>
      </header>

      {loading ? (
        <p style={styles.empty}>{t.loading}</p>
      ) : taskCustomers.length === 0 ? (
        <p style={styles.empty}>{t.empty}</p>
      ) : (
        <div style={styles.grid}>
          {taskCustomers.map((c) => (
            <article key={String(c.id)} style={styles.card}>
              <h2 style={styles.cardTitle}>
                {c.customer_name?.trim() || t.unnamed}
              </h2>

              <div style={styles.meta}>
                <p>
                  <strong>{t.company}：</strong>
                  {c.company_name?.trim() || "-"}
                </p>
                <p>
                  <strong>{t.phone}：</strong>
                  {c.phone?.trim() || "-"}
                </p>
                <p>
                  <strong>LINE：</strong>
                  {c.line_id?.trim() || "-"}
                </p>
              </div>

              <div style={styles.fields}>
                <p>
                  <strong>{t.todo}：</strong>
                  {hasContent(c.todo) ? displayValue(c.todo) : "-"}
                </p>
                <p>
                  <strong>{t.nextStep}：</strong>
                  {hasContent(c.next_step) ? displayValue(c.next_step) : "-"}
                </p>
                <p>
                  <strong>{t.followUp}：</strong>
                  {hasContent(c.follow_up) ? displayValue(c.follow_up) : "-"}
                </p>
              </div>

              <div style={styles.actions}>
                <button
                  type="button"
                  style={styles.copyBtn}
                  disabled={!hasContent(c.follow_up)}
                  onClick={() => void copyFollowUp(c.follow_up!.trim())}
                >
                  {t.copyFollowUp}
                </button>
                <button
                  type="button"
                  style={styles.doneBtn}
                  onClick={() => alert(t.markedDone)}
                >
                  {t.tracked}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #02142b 0%, #06192f 50%, #003c42 100%)",
    color: "white",
    padding: "clamp(20px, 4vw, 40px)",
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    lineHeight: 1.55,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 20,
    marginBottom: 36,
  },
  title: {
    fontSize: "clamp(2rem, 5vw, 3rem)",
    margin: 0,
    color: "#f8fafc",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    lineHeight: 1.15,
  },
  subtitle: {
    color: "#8ea4c7",
    marginTop: 12,
    marginBottom: 0,
    fontSize: 18,
    lineHeight: 1.55,
  },
  backLink: {
    color: "#94a3b8",
    textDecoration: "none",
    fontSize: 16,
    fontWeight: 600,
    padding: "12px 18px",
    borderRadius: 12,
    border: "1px solid #1e3a5f",
    background: "#102742",
  },
  empty: {
    color: "#94a3b8",
    fontSize: 18,
    lineHeight: 1.65,
  },
  grid: {
    display: "grid",
    gap: 28,
  },
  card: {
    background: "#102742",
    border: "1px solid #1e3a5f",
    borderRadius: 16,
    padding: 30,
    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
  },
  cardTitle: {
    fontSize: 32,
    margin: "0 0 18px",
    color: "#facc15",
    fontWeight: 700,
  },
  meta: {
    lineHeight: 2,
    marginBottom: 18,
    color: "#cbd5e1",
    fontSize: 17,
  },
  fields: {
    lineHeight: 2,
    marginBottom: 22,
    padding: 20,
    borderRadius: 12,
    background: "rgba(6, 25, 47, 0.6)",
    border: "1px solid #1e3a5f",
    fontSize: 17,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
  },
  copyBtn: {
    flex: "1 1 160px",
    padding: "14px 20px",
    borderRadius: 12,
    border: "none",
    background: "#1ee05f",
    color: "white",
    fontWeight: 700,
    fontSize: 17,
    cursor: "pointer",
  },
  doneBtn: {
    flex: "1 1 120px",
    padding: "14px 20px",
    borderRadius: 12,
    border: "1px solid #475569",
    background: "transparent",
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: 17,
    cursor: "pointer",
  },
};
