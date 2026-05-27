import { NextResponse } from "next/server";
import { parsePreferredCompanyId, requireApiAuth } from "../../lib/apiAuth";
import { openAiChatCompletion } from "../../lib/aiUsageServer";
import {
  extractCustomerFromLineChat,
  extractHonorificCustomerName,
  extractSocialFieldsFromLineChat,
  isNotProvidedLabel,
  mergeConfirmedCrmExtraction,
  sanitizeAiCustomerFields,
} from "../../lib/extractCustomerFromLineChat";
import { normalizeLineIdForDisplay } from "../../lib/lineIdDisplay";
import { parseAiJsonObject } from "../../lib/parseAiJson";
import { sanitizeImportantDateFields } from "../../lib/sanitizeImportantDateFields";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const preferredCompanyId = parsePreferredCompanyId(
    body.company_id ?? body.companyId ?? body.workspace_id ?? body.workspaceId,
  );

  const auth = await requireApiAuth(req, { preferredCompanyId });
  if (auth instanceof NextResponse) {
    return auth;
  }
  const { companyId, user } = auth;

  if (!companyId || companyId <= 0) {
    return NextResponse.json({ error: "找不到工作區" }, { status: 404 });
  }

  try {
    const rawLang = body.lang;
    const lang = rawLang === "en" ? "en" : "zh";
    const inputText = typeof body.text === "string" ? body.text : "";

    if (process.env.NODE_ENV !== "production") {
      console.log("[analyze] request context:", {
        userId: user.id,
        companyId,
        workspaceId: companyId,
        textLength: inputText.length,
      });
    }

    const regexExtracted = extractCustomerFromLineChat(inputText, lang);
    const honorificName = extractHonorificCustomerName(inputText);
    if (honorificName && !regexExtracted.customer_name) {
      regexExtracted.customer_name = honorificName;
    }

    const prompt = `
你是一個專業 CRM AI 助理。請閱讀「整段」LINE 對話（含所有發言與標籤列），擷取客戶聯絡與商業資訊。

規則 — 客戶姓名 customerName：
1. 僅在明確自介時填寫（我叫/我是/XXX先生/XXX小姐/王小姐：/Linda）
2. 禁止把「在、有、想、我們、今天」或問候語當姓名；沒有則寫「未提供姓名」

規則 — 公司名稱 company（正式品牌／診所／門市名稱）：
3. 從整段對話判斷是否有「真正的」公司/品牌/診所/店名，例如：
   - 我們是 XXX、我們公司叫 XXX、公司名稱：XXX、店名：XXX、品牌名稱：XXX
   - 客戶名稱：林小姐（星采醫美診所）→ company 應為「星采醫美診所」
4. 「精品家具」「醫美診所」等僅屬業種時，company 留空，改填 industry
5. Instagram/Facebook/TikTok/YouTube 標籤列的帳號名「不要」當 company，除非整段對話沒有更明確的品牌名且該名稱明顯是診所/品牌（如 Star Clinic Taipei）

規則 — 產業 industry（業種，較 company 更泛）：
6. 填寫業種如：精品家具、義大利進口家具、醫美診所、健身房、餐酒館
7. 若有公司名「星采醫美診所」，industry 可填「醫美診所」；若只有「精品家具」則 industry=精品家具、company 留空

其他欄位：
8. 有標籤列（客戶/公司/電話/LINE ID/預算/需求/社群）時優先使用
9. 找不到的欄位寫「未提供」；customerNeed 用簡短條列，不要貼整段對話
10. 回傳 JSON，不要 markdown

請分析：

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
      return NextResponse.json(
        { error: aiCall.error },
        { status: aiCall.status },
      );
    }

    const result = aiCall.result.content;
    const aiParsed = parseAiJsonObject(result);
    if (!aiParsed) {
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
    const aiCompany = String(aiParsed.company ?? aiParsed.companyName ?? "").trim();
    const aiIndustry = String(aiParsed.industry ?? aiParsed.businessType ?? "").trim();

    const payload = sanitizeImportantDateFields(
      {
        ...aiParsed,
        customerName: profile.customer_name,
        company: profile.company_name || (isNotProvidedLabel(aiCompany) ? "" : aiCompany),
        companyName: profile.company_name || (isNotProvidedLabel(aiCompany) ? "" : aiCompany),
        industry: profile.industry || (isNotProvidedLabel(aiIndustry) ? "" : aiIndustry),
        phone: profile.phone || String(aiParsed.phone ?? "").trim(),
        lineId: normalizeLineIdForDisplay(profile.line_id),
        email: profile.email || String(aiParsed.email ?? "").trim(),
        customerNeed: profile.customer_need || notProvided,
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

    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);

    return NextResponse.json({
      error: "AI 分析失敗",
    });
  }
}
