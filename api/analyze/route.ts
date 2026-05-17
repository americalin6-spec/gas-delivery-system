import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    const prompt = `
你是一個專業 CRM AI 助理。

請分析以下 LINE 對話內容。

規則：
1. customerName 僅在對話明確自介時填寫（我叫/我是/XXX先生/XXX小姐/公司名+姓名）；禁止用第一句、問候語、疑問句當姓名
2. 沒有明確姓名時 customerName 必須寫「未提供姓名」
3. 其他欄位沒有明確資料就寫「未提供」
4. 幫我整理真正重要的商業資訊
5. 回傳 JSON 格式

請分析：

${text}

請回傳：

{
  "customerName": "",
  "company": "",
  "phone": "",
  "lineId": "",
  "email": "",
  "customerNeed": "",
  "importantDate": "",
  "customerMood": "",
  "dealProbability": "",
  "nextStep": "",
  "summary": ""
}
`;

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
      }
    );

    const data = await response.json();

    const result = data.choices?.[0]?.message?.content;

    return NextResponse.json(JSON.parse(result));
  } catch (error) {
    console.error(error);

    return NextResponse.json({
      error: "AI 分析失敗",
    });
  }
}