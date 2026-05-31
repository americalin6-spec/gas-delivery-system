import { NextResponse } from "next/server";
import { requireApiAuth } from "../../lib/apiAuth";
import { formatAiQuotaDeniedApiBody } from "../../lib/aiQuotaUpgrade";
import {
  finalizeAiUsageSuccess,
  openAiChatCompletion,
  releaseAiQuotaReservation,
} from "../../lib/aiUsageServer";
import { buildCustomerAiPatchFromAnalyzePayload } from "../../lib/customerAiPersistence";
import { fetchCustomerByIdForActiveCompany } from "../../lib/customersTenant";
import {
  extractCustomerFromLineChat,
  extractHonorificCustomerName,
  extractSocialFieldsFromLineChat,
  isNotProvidedLabel,
  mergeConfirmedCrmExtraction,
  readAiCustomerNeedFromPayload,
  readAiCustomerNeedsFromPayload,
  resolveDisplayedCustomerNeeds,
  sanitizeAiCustomerFields,
} from "../../lib/extractCustomerFromLineChat";
import { normalizeLineIdForDisplay } from "../../lib/lineIdDisplay";
import { parseAiJsonObject } from "../../lib/parseAiJson";
import { sanitizeImportantDateFields } from "../../lib/sanitizeImportantDateFields";
import { logUnexpectedException } from "../../lib/safeApiError";

export async function POST(req: Request) {
  let heldReservation:
    | import("../../lib/aiUsageServer").AiQuotaReservation
    | null = null;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const { supabase, companyId, workspaceId, user } = auth;
  const customerId = String(body.customer_id ?? body.customerId ?? "").trim();

  if (!companyId || companyId <= 0 || !workspaceId || workspaceId <= 0) {
    return NextResponse.json({ error: "找不到工作區" }, { status: 404 });
  }

  try {
    const rawLang = body.lang;
    const lang = rawLang === "en" ? "en" : "zh";
    const inputText = typeof body.text === "string" ? body.text : "";

    const regexExtracted = extractCustomerFromLineChat(inputText, lang);
    const honorificName = extractHonorificCustomerName(inputText);
    if (honorificName && !regexExtracted.customer_name) {
      regexExtracted.customer_name = honorificName;
    }

    const prompt = `
你是一個專業 CRM AI 助理。請完整閱讀下方「整段 LINE 對話」（含所有發言、時間戳、標籤列），以整段對話為唯一分析依據，不可只看單一詞或片段。

規則 — 整體分析：
1. 必須綜合整段對話脈絡，判斷客戶產業、需求、預算、時程、情緒與成交意圖
2. summary 用 2–4 句繁體中文，概括整段對話重點（不可只寫「10分鐘」等單一片段）
3. customerNeed 用簡短條列（、分隔），涵蓋對話中所有關鍵需求；不可只擷取通勤時間或單一數字
4. nextStep / replySuggestion / todo / followUp 必須呼應整段對話，不可只針對單一片段

規則 — 客戶姓名 customerName：
5. 僅在明確自介時填寫（我叫/我是/XXX先生/XXX小姐/王小姐：/Linda）
6. 禁止把「在、有、想、我們、今天」或問候語當姓名；沒有則寫「未提供姓名」

規則 — 公司名稱 company（正式品牌／診所／門市名稱）：
7. 從整段對話判斷是否有「真正的」公司/品牌/診所/店名
8. 「精品家具」「醫美診所」等僅屬業種時，company 留空，改填 industry
9. Instagram/Facebook/TikTok/YouTube 標籤列的帳號名「不要」當 company

規則 — 產業 industry（業種，較 company 更泛）：
10. 填寫業種如：精品家具、義大利進口家具、醫美診所、健身房、餐酒館、房地產

規則 — 預算 estimatedAmount：
11. 若有預算，以新台幣整數填寫（例如 30000000 代表 3000 萬）；區間用 25000000~30000000
12. 找不到則寫「未提供」

其他欄位：
13. 有標籤列（客戶/公司/電話/LINE ID/預算/需求/社群）時優先使用
14. 找不到的欄位寫「未提供」
15. 回傳 JSON，不要 markdown

規則 — 成交機率 dealProbability（僅填「高」「中」「低」其一）：
16. 高：明確預算、具體需求、急迫時程
17. 中：有預算或需求但仍在比較
18. 低：僅初步詢問、無預算、觀望

規則 — 客戶情緒 customerMood（簡短中文）：
19. 依語氣、回覆速度、急迫度填寫

請分析整段 LINE 對話：

${inputText}

請回傳：

{
  "customerName": "",
  "company": "",
  "industry": "",
  "phone": "",
  "lineId": "",
  "email": "",
  "customerNeed": "",
  "estimatedAmount": "",
  "importantDate": "",
  "customerMood": "",
  "dealProbability": "",
  "nextStep": "",
  "replySuggestion": "",
  "todo": "",
  "followUp": "",
  "summary": ""
}
`;

    const aiCall = await openAiChatCompletion({
      companyId,
      userId: user.id,
      feature: "analyze",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    if (aiCall.ok === false) {
      return NextResponse.json(formatAiQuotaDeniedApiBody(aiCall), {
        status: aiCall.status,
      });
    }
    heldReservation = aiCall.result.reservation;

    const result = aiCall.result.content;
    const aiParsed = parseAiJsonObject(result);
    if (!aiParsed) {
      await releaseAiQuotaReservation(aiCall.result.reservation);
      console.error("[analyze] invalid AI JSON", {
        preview: typeof result === "string" ? result.slice(0, 300) : result,
      });
      return NextResponse.json({ error: "AI 分析失敗" });
    }

    const sanitizedAi = sanitizeAiCustomerFields(aiParsed, lang);
    const aiAmount = String(aiParsed.estimatedAmount ?? "").trim();
    const { profile, estimatedAmount } = mergeConfirmedCrmExtraction(
      inputText,
      lang,
      regexExtracted,
      sanitizedAi,
      { estimatedAmount: aiAmount },
    );

    const notProvided = lang === "zh" ? "未提供" : "Not provided";
    const social = extractSocialFieldsFromLineChat(inputText);
    const aiIndustry = String(aiParsed.industry ?? aiParsed.businessType ?? "").trim();
    const rawAiCustomerNeeds = readAiCustomerNeedsFromPayload(aiParsed);
    const rawAiCustomerNeed = readAiCustomerNeedFromPayload(aiParsed);
    const displayCustomerNeed = resolveDisplayedCustomerNeeds({
      aiCustomerNeeds: rawAiCustomerNeeds,
      customerNeed: rawAiCustomerNeed,
      mergedCustomerNeed: profile.customer_need,
      lang,
    });
    const aiCustomerNeedsValue =
      rawAiCustomerNeeds && !isNotProvidedLabel(rawAiCustomerNeeds)
        ? rawAiCustomerNeeds
        : rawAiCustomerNeed && !isNotProvidedLabel(rawAiCustomerNeed)
          ? rawAiCustomerNeed
          : displayCustomerNeed;

    const payload = sanitizeImportantDateFields(
      {
        ...aiParsed,
        customerName: profile.customer_name,
        company: profile.company_name,
        companyName: profile.company_name,
        industry: profile.industry || (isNotProvidedLabel(aiIndustry) ? "" : aiIndustry),
        phone: profile.phone || String(aiParsed.phone ?? "").trim(),
        lineId: normalizeLineIdForDisplay(profile.line_id),
        email: profile.email || String(aiParsed.email ?? "").trim(),
        ai_customer_needs: aiCustomerNeedsValue,
        customerNeed: displayCustomerNeed,
        estimatedAmount: estimatedAmount || notProvided,
        importantDate: notProvided,
        instagram: social.instagram ?? "",
        facebook: social.facebook ?? "",
        tiktok: social.tiktok ?? "",
        youtube: social.youtube ?? "",
        xiaohongshu: social.xiaohongshu ?? "",
      },
      inputText,
      lang,
    );

    if (customerId) {
      const { customer, error: fetchError } = await fetchCustomerByIdForActiveCompany(
        supabase,
        customerId,
        companyId,
      );

      if (fetchError || !customer) {
        console.log("[analyze-save]", {
          customerId,
          updatePayload: null,
          updateResult: null,
          updateError: fetchError?.message ?? "customer not found or access denied",
        });
      } else {
        const patch = buildCustomerAiPatchFromAnalyzePayload(
          payload as Record<string, unknown>,
        );
        const updatePayload = Object.fromEntries(
          Object.entries(patch).filter(([, value]) => value != null),
        );

        const { data: updateResult, error: updateError } = await supabase
          .from("customers")
          .update(updatePayload)
          .eq("company_id", companyId)
          .eq("id", customerId)
          .select("id, ai_summary, ai_customer_needs, ai_emotion, ai_next_step, ai_probability");

        console.log("[analyze-save]", {
          customerId,
          updatePayload,
          updateResult,
          updateError: updateError?.message ?? null,
        });
      }
    }

    // Successful OpenAI + parsed JSON counts as AI usage (homepage has no customer_id yet).
    await finalizeAiUsageSuccess({
      reservation: aiCall.result.reservation,
      companyId,
      userId: user.id,
      feature: "analyze",
      estimatedTokens: aiCall.result.estimatedTokens,
    });
    heldReservation = null;

    return NextResponse.json(payload);
  } catch (error) {
    if (heldReservation) {
      await releaseAiQuotaReservation(heldReservation);
    }
    logUnexpectedException(error, {
      eventType: "exception",
      companyId,
      userId: user.id,
      route: "/api/analyze",
    });

    return NextResponse.json({
      error: "AI 分析失敗",
    });
  }
}
