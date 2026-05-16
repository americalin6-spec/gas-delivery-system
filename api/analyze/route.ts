import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { text } = await req.json();

  console.log("收到前端資料：", text);

  return NextResponse.json({
    dealProbability: "高",
    customerLevel: "A級客戶",
    leakRisk: "低",
    estimatedAmount: "15萬以內",
    customerNeed: "品牌影片、高級感、兩週內交付",
    importantDate: "兩週內",
    customerMood: "積極、有明確需求",
    nextStep: "立即提供企劃方向與報價",
    professionalReply: "您好，了解您的需求，我們可以協助規劃一支具高級感的品牌影片，並控制在15萬以內。我會先整理初步方案與報價給您確認。",
    followMessage: "您好，想跟您確認品牌影片的方向，我們可以先提供兩種企劃版本讓您選擇。",
  });
}