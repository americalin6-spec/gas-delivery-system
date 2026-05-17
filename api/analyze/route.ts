import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    const prompt = `
你是一個專業 CRM AI 助理。

請分析以下 LINE 對話內容。

規則：
1. 不要亂猜姓名
2. 沒有明確資料就寫「未提供」
3. 幫我整理真正重要的商業資訊
4. 回傳 JSON 格式

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