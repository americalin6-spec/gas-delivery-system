import { NextResponse } from "next/server";
import {
  extractCustomerFromLineChat,
  extractHonorificCustomerName,
  isNotProvidedLabel,
  mergeConfirmedCrmExtraction,
  sanitizeAiCustomerFields,
} from "../../lib/extractCustomerFromLineChat";
import { parseAiJsonObject } from "../../lib/parseAiJson";
import { sanitizeImportantDateFields } from "../../lib/sanitizeImportantDateFields";

export async function POST(req: Request) {
  try {
    const { text, lang: rawLang } = await req.json();
    const lang = rawLang === "en" ? "en" : "zh";
    const inputText = typeof text === "string" ? text : "";

    const regexExtracted = extractCustomerFromLineChat(inputText, lang);
    const honorificName = extractHonorificCustomerName(inputText);
    if (honorificName && !regexExtracted.customer_name) {
      regexExtracted.customer_name = honorificName;
    }

    const prompt = `
你是一個專業 CRM AI 助理。

請分析以下 LINE 對話內容。

規則：
1. customerName 僅在對話明確自介時填寫（我叫/我是/XXX先生/XXX小姐/公司名+姓名）；禁止用第一句、問候語、疑問句當姓名
2. 沒有明確姓名時 customerName 必須寫「未提供姓名」
3. 從對話擷取並填入：客戶(customerName)、公司(company)、電話(phone)、LINE ID(lineId)、預算(estimatedAmount)、需求(customerNeed)
4. 有標籤列（如「客戶：」「公司：」「電話：」「LINE ID：」「預算：」「需求：」）時優先使用該列內容
5. 其他欄位沒有明確資料就寫「未提供」
6. customerNeed 用簡短條列整理對話中的具體業務需求（功能、模組、時程、預算），不要整段貼上對話，不要寫空泛摘要
7. 回傳 JSON 格式

請分析：

${inputText}

請回傳：

{
  "customerName": "",
  "company": "",
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

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content;
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
    const aiCustomerName = String(aiParsed.customerName ?? "").trim();
    const aiCompany = String(aiParsed.company ?? aiParsed.companyName ?? "").trim();

    const payload = sanitizeImportantDateFields(
      {
        ...aiParsed,
        customerName: profile.customer_name || (isNotProvidedLabel(aiCustomerName) ? "" : aiCustomerName),
        company: profile.company_name || (isNotProvidedLabel(aiCompany) ? "" : aiCompany),
        companyName: profile.company_name || (isNotProvidedLabel(aiCompany) ? "" : aiCompany),
        phone: profile.phone || String(aiParsed.phone ?? "").trim(),
        lineId: profile.line_id || String(aiParsed.lineId ?? "").trim(),
        email: profile.email || String(aiParsed.email ?? "").trim(),
        customerNeed: profile.customer_need || notProvided,
        estimatedAmount: estimatedAmount || notProvided,
        importantDate: notProvided,
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
