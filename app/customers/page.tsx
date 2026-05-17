"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  formatFollowUpDateDisplay,
  getFollowUpBadge,
  normalizeFollowUpDateValue,
  type FollowUpBadge,
} from "../lib/followUpReminders";
import { followUpModeBadgeMeta, normalizeFollowUpMode } from "../lib/followUpMode";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import { useAppLang } from "../hooks/useAppLang";
import { customersListCopy, followUpBadgeLabelForLang } from "../lib/customersI18n";
import { translateDisplayValue } from "../lib/uiI18n";
import type { AppLang } from "../lib/appLang";
import { supabase } from "../../supabase";
import { TextInputWithVoice } from "../components/VoiceInputButton";

const CRM_MOBILE_MAX_WIDTH = 768;

function crmFollowUpBadgeLook(
  badge: FollowUpBadge,
  lang: AppLang,
): { bg: string; color: string; border: string; label: string } {
  const label = followUpBadgeLabelForLang(badge, lang);
  switch (badge) {
    case "overdue":
      return {
        bg: "rgba(239,68,68,0.22)",
        color: "#fecaca",
        border: "rgba(248,113,113,0.45)",
        label,
      };
    case "soon":
      return {
        bg: "rgba(245,158,11,0.22)",
        color: "#fde68a",
        border: "rgba(251,191,36,0.45)",
        label,
      };
    case "upcoming":
      return {
        bg: "rgba(59,130,246,0.2)",
        color: "#bfdbfe",
        border: "rgba(96,165,250,0.45)",
        label,
      };
    default:
      return { bg: "transparent", color: "#fff", border: "transparent", label: "" };
  }
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");

  const isMobile = useIsViewportBelow(CRM_MOBILE_MAX_WIDTH);
  const { lang } = useAppLang();
  const t = customersListCopy(lang);
  const displayValue = (value?: string | null) => {
    if (!value?.trim() || value.trim() === "-") return "-";
    return translateDisplayValue(value, lang);
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("id", { ascending: false });

    if (!error && data) {
      setCustomers(data);
    }
  }

  async function handleAddCustomer() {
    if (!customerName.trim()) {
      alert(t.enterName);
      return;
    }

    const { error } = await supabase.from("customers").insert([
      {
        customer_name: customerName,
        company_name: companyName,
        phone: phone,
      },
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert(t.addSuccess);

    setCustomerName("");
    setCompanyName("");
    setPhone("");

    loadCustomers();
  }

  async function deleteCustomer(id: number) {
    const ok = confirm(t.confirmDelete);

    if (!ok) return;

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadCustomers();
  }

  const filteredCustomers = customers.filter((c) => {
    const keyword = search.toLowerCase();

    return (
      (c.customer_name || "").toLowerCase().includes(keyword) ||
      (c.company_name || "").toLowerCase().includes(keyword) ||
      (c.phone || "").toLowerCase().includes(keyword) ||
      (c.line_id || "").toLowerCase().includes(keyword) ||
      (c.email || "").toLowerCase().includes(keyword)
    );
  });

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
          gap: 22,
          marginBottom: isMobile ? 36 : 44,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: isMobile ? 40 : 56,
              margin: 0,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            {t.title}
          </h1>

          <p
            style={{
              opacity: 0.82,
              marginTop: 14,
              fontSize: isMobile ? 16 : 18,
              lineHeight: 1.55,
            }}
          >
            {t.count(customers.length, filteredCustomers.length)}
          </p>
        </div>

        <Link href="/">
          <button
            style={{
              background: "#102742",
              color: "white",
              border: "none",
              padding: isMobile ? "15px 20px" : "15px 26px",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 16,
              width: isMobile ? "100%" : "auto",
            }}
          >
            {t.backHome}
          </button>
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          gap: isMobile ? 28 : 36,
          alignItems: "flex-start",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div style={{ flex: 1, width: "100%" }}>
          <TextInputWithVoice
            lang={lang}
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={setSearch}
            inputStyle={{
              width: "100%",
              padding: "18px 20px",
              borderRadius: 14,
              border: "none",
              marginBottom: 28,
              background: "#102742",
              color: "white",
              fontSize: 17,
              boxSizing: "border-box",
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
            }}
          >
            {filteredCustomers.map((c) => (
              <div
                key={c.id}
            style={{
              background: "#102742",
              borderRadius: 24,
              padding: isMobile ? 24 : 36,
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
              minWidth: 0,
            }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: isMobile ? "flex-start" : "center",
                    flexDirection: isMobile ? "column" : "row",
                    gap: 18,
                    marginBottom: 26,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: isMobile ? 32 : 44,
                        fontWeight: 700,
                        letterSpacing: "-0.02em",
                        lineHeight: 1.2,
                      }}
                    >
                      {c.customer_name || t.unnamed}
                    </h2>

                    <div
                      style={{
                        marginTop: 18,
                        lineHeight: 2,
                        opacity: 0.92,
                        fontSize: isMobile ? 16 : 17,
                      }}
                    >
                      <div>{t.company}：{c.company_name || "-"}</div>
                      <div>{t.phone}：{c.phone || "-"}</div>
                      <div>LINE：{c.line_id || "-"}</div>
                      <div>Email：{c.email || "-"}</div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: isMobile ? "stretch" : "flex-end",
                      gap: 10,
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        justifyContent: isMobile ? "flex-start" : "flex-end",
                      }}
                    >
                      {(() => {
                        const mode = normalizeFollowUpMode(c.follow_up_mode);
                        const mm = followUpModeBadgeMeta(mode, lang);
                        return (
                          <span
                            title={mm.subtitle}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 999,
                              fontSize: 14,
                              fontWeight: 700,
                              background: mm.bg,
                              color: mm.color,
                              border: `1px solid ${mm.border}`,
                            }}
                          >
                            {mm.label}
                          </span>
                        );
                      })()}
                      {(() => {
                        const fd = normalizeFollowUpDateValue(c.follow_up_date);
                        if (!fd) return null;
                        const b = getFollowUpBadge(fd);
                        if (b === "none") return null;
                        const look = crmFollowUpBadgeLook(b, lang);
                        return (
                          <span
                            title={t.followUpTitle(formatFollowUpDateDisplay(fd, lang))}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 999,
                              fontSize: 14,
                              fontWeight: 700,
                              background: look.bg,
                              color: look.color,
                              border: `1px solid ${look.border}`,
                            }}
                          >
                            {look.label} · {formatFollowUpDateDisplay(fd, lang)}
                          </span>
                        );
                      })()}
                      <div
                        style={{
                          background: "#1a3557",
                          padding: "10px 16px",
                          borderRadius: 999,
                          fontSize: 15,
                          fontWeight: 600,
                        }}
                      >
                        {displayValue(c.customer_level) === "-" ? t.unknown : displayValue(c.customer_level)}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "1fr 1fr",
                    gap: 26,
                  }}
                >
                  <div
                    style={{
                      lineHeight: 2.05,
                      fontSize: isMobile ? 16 : 17,
                    }}
                  >
                    <div>
                      {t.customerNeed}：{displayValue(c.customer_need)}
                    </div>
                    <div>
                      {t.customerEmotion}：{displayValue(c.customer_emotion)}
                    </div>
                    <div>
                      {t.importantDate}：{displayValue(c.important_date)}
                    </div>
                    <div>
                      {t.nextStep}：{displayValue(c.next_step)}
                    </div>
                  </div>

                  <div
                    style={{
                      lineHeight: 2.05,
                      fontSize: isMobile ? 16 : 17,
                    }}
                  >
                    <div>
                      {t.estimatedAmount}：{displayValue(c.estimated_amount)}
                    </div>
                    <div>
                      {t.dealProbability}：{displayValue(c.success_rate)}
                    </div>
                    <div>
                      {t.churnRisk}：{displayValue(c.churn_risk)}
                    </div>
                    <div>
                      {t.todo}：{displayValue(c.todo)}
                    </div>
                    <div>
                      {t.replySuggestion}：{displayValue(c.reply_suggestion)}
                    </div>
                    <div>
                      {t.followUp}：{displayValue(c.follow_up)}
                    </div>
                    <div>
                      {t.aiSend}：
                      {followUpModeBadgeMeta(normalizeFollowUpMode(c.follow_up_mode), lang).label}
                    </div>
                    <div>
                      {t.followUpReminder}：
                      {(() => {
                        const norm = normalizeFollowUpDateValue(c.follow_up_date);
                        return norm
                          ? `${formatFollowUpDateDisplay(norm, lang)} (${norm})`
                          : "-";
                      })()}
                    </div>
                    <div>{t.note}：{c.note || "-"}</div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    marginTop: 32,
                    flexDirection: isMobile ? "column" : "row",
                  }}
                >
                  <Link
                    href={`/customers/${c.id}`}
                    style={{ width: isMobile ? "100%" : "auto" }}
                  >
                    <button
                      style={{
                        background: "#22c55e",
                        color: "white",
                        border: "none",
                        padding: "15px 22px",
                        borderRadius: 12,
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 16,
                        width: isMobile ? "100%" : "auto",
                      }}
                    >
                      {t.viewDetail}
                    </button>
                  </Link>

                  <button
                    onClick={() => deleteCustomer(c.id)}
                    style={{
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      padding: "15px 22px",
                      borderRadius: 12,
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 16,
                      width: isMobile ? "100%" : "auto",
                    }}
                  >
                    {t.deleteCustomer}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            width: isMobile ? "100%" : 340,
            background: "#081b33",
            padding: isMobile ? 22 : 26,
            borderRadius: 20,
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: 22,
              fontSize: isMobile ? 26 : 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {t.addCustomer}
          </h3>

          <TextInputWithVoice
            lang={lang}
            placeholder={t.namePlaceholder}
            value={customerName}
            onChange={setCustomerName}
            inputStyle={{
              width: "100%",
              padding: "15px 16px",
              marginBottom: 14,
              borderRadius: 10,
              border: "none",
              background: "#102742",
              color: "white",
              boxSizing: "border-box",
              fontSize: 17,
            }}
          />

          <TextInputWithVoice
            lang={lang}
            placeholder={t.companyPlaceholder}
            value={companyName}
            onChange={setCompanyName}
            inputStyle={{
              width: "100%",
              padding: "15px 16px",
              marginBottom: 14,
              borderRadius: 10,
              border: "none",
              background: "#102742",
              color: "white",
              boxSizing: "border-box",
              fontSize: 17,
            }}
          />

          <TextInputWithVoice
            lang={lang}
            placeholder={t.phonePlaceholder}
            value={phone}
            onChange={setPhone}
            inputStyle={{
              width: "100%",
              padding: "15px 16px",
              marginBottom: 14,
              borderRadius: 10,
              border: "none",
              background: "#102742",
              color: "white",
              boxSizing: "border-box",
              fontSize: 17,
            }}
          />

          <button
            onClick={handleAddCustomer}
            style={{
              width: "100%",
              background: "#facc15",
              color: "black",
              border: "none",
              padding: "16px 14px",
              borderRadius: 10,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 17,
            }}
          >
            {t.addCustomerBtn}
          </button>
        </div>
      </div>
    </main>
  );
}