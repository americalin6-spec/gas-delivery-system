/** LINE-style paste examples for empty conversation textarea typewriter demo. */
export const LINE_CONVERSATION_EXAMPLES: readonly string[] = [
  `王小姐：
最近想找新竹高鐵附近的房子

Chris：
您好 😊
請問預算大概抓多少呢？

王小姐：
3000萬左右`,

  `林先生：
想幫公司拍一支形象影片

Amy：
了解，請問影片主要用途是？

林先生：
新品上市用，大概一分鐘`,

  `陳小姐：
想了解一下醫美皮秒

諮詢師小安：
您好，請問主要想改善哪方面？

陳小姐：
斑點跟毛孔，下週有空先諮詢`,

  `黃先生：
家庭保單想重新規劃

保險顧問Ken：
您好，請問目前最在意的是？

黃先生：
小孩教育金跟醫療保障`,

  `周小姐：
我們想重做公司官網

Mark：
請問目前有網站嗎？主要想改善什麼？

周小姐：
有舊站，想更專業也更好找`,

  `吳先生：
想詢問企業 CRM 方案

業務Leo：
您好，請問團隊大概幾人使用？

吳先生：
業務 8 人，需要跟進提醒`,

  `張小姐：
想報名私人教練課

教練Jason：
您好，請問主要目標是？

張小姐：
減脂，一週可上 2 次`,

  `許先生：
想預約母親節聚餐包廂

店長May：
您好，請問大概幾位、預算區間？

許先生：
12 人，每人 1500 左右`,

  `鄭小姐：
婚禮攝影想先了解

攝影師Ivy：
您好，請問婚期大概何時？

鄭小姐：
10 月，想要紀錄風格`,

  `劉先生：
公司想請律師看合約

王律師：
您好，請問是哪類合約？

劉先生：
經銷合約，想確認付款條款`,

  `蔡小姐：
孩子數學想加強

補習班老師：
請問目前是幾年級？

蔡小姐：
國二，段考成績不太理想`,

  `楊先生：
舊廚房想翻新

設計師Emily：
了解，請問廚房大約多大？

楊先生：
約 5 坪，想換櫥櫃`,

  `高小姐：
想租活動場地辦發表會

場地小潔：
您好，請問預計多少人？

高小姐：
80 人，需要投影跟茶點`,

  `何先生：
想請人幫辦公室清潔

客服小芳：
請問坪數與清潔頻率？

何先生：
約 30 坪，每週一次`,

  `謝小姐：
狗狗美容想預約

美容師Nini：
您好，請問狗狗品種與體型？

謝小姐：
貴賓犬，大概 5 公斤`,

  `羅先生：
想預約汽車鍍膜

店長阿杰：
您好，請問車型與年份？

羅先生：
Toyota RAV4，2022 年`,

  `范小姐：
文件要翻成英文

翻譯社：
您好，請問字數與交件時間？

范小姐：
約 3000 字，這週五前要`,

  `彭先生：
新辦公室想做室內設計

設計師Luna：
了解，請問坪數與風格偏好？

彭先生：
約 40 坪，想要明亮簡約`,

  `董小姐：
想諮詢雅思課程

顧問Tom：
您好，目前程度大約多少？

董小姐：
目標 6.5，三個月內考試`,

  `石先生：
想幫分店做社群代操

社群小編：
您好，請問目前有哪些平台？

石先生：
IG 跟 FB，每週 3 篇`,
] as const;

export function pickRandomLineConversationExample(): string {
  const index = Math.floor(Math.random() * LINE_CONVERSATION_EXAMPLES.length);
  return LINE_CONVERSATION_EXAMPLES[index] ?? LINE_CONVERSATION_EXAMPLES[0];
}

export function pickRandomLineConversationExampleExcept(current: string): string {
  if (LINE_CONVERSATION_EXAMPLES.length <= 1) {
    return pickRandomLineConversationExample();
  }

  let next = pickRandomLineConversationExample();
  while (next === current) {
    next = pickRandomLineConversationExample();
  }
  return next;
}
