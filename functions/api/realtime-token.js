import { error, handleOptions, json } from "../_lib/http.js";

export async function onRequest(context) {
  const options = handleOptions(context.request);
  if (options) return options;

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    return error("尚未設定 OPENAI_API_KEY，無法建立 Realtime session。", 501);
  }

  const model = context.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2";
  const questions = [
    {
      level: 1,
      title: "詞語理解",
      question: "「仔細」的意思比較接近下面哪一個詞？一，馬虎。二，認真。三，快速。",
      answer: "二，認真",
      hint: "想一想，仔細做事的人，是隨便做，還是很用心做？"
    },
    {
      level: 2,
      title: "量詞",
      question: "請聽題目。下列哪一句量詞用得比較正確？一，一本鉛筆。二，一枝鉛筆。三，一朵鉛筆。",
      answer: "二，一枝鉛筆",
      hint: "鉛筆細細長長的，通常會說一枝。"
    },
    {
      level: 3,
      title: "造句",
      question: "請用「因為，所以」說一句完整的句子。",
      answer: "只要有因果關係，而且句子完整即可，例如：因為下雨，所以我帶雨傘。",
      hint: "先說原因，再說結果。可以從天氣、上學或生活例子開始。"
    },
    {
      level: 4,
      title: "閱讀理解",
      question: "短文題。小明每天放學後先寫功課，再去操場打球。請問小明放學後先做什麼？",
      answer: "先寫功課",
      hint: "題目說先寫功課，再去打球。注意『先』這個字。"
    },
    {
      level: 5,
      title: "成語感覺",
      question: "「七上八下」通常是形容什麼心情？一，很安心。二，很緊張。三，很想睡。",
      answer: "二，很緊張",
      hint: "心裡七上八下，代表心情不安定。"
    }
  ];
  const session = {
    session: {
      type: "realtime",
      model,
      audio: {
        output: {
          voice: "marin"
        }
      },
      instructions: [
        "你是國小三年級國語闖關遊戲主持人。",
        "這是語音一問一答遊戲，不是一般聊天。請用繁體中文，語氣可愛、短句、鼓勵。",
        "規則：一次只問一題。問完題目後停下來等孩子回答。孩子回答後，判斷對錯，再用一句話回饋。",
        "答對：說『過關』、加一分，然後進下一關。答錯：不要直接罵，先給提示，請孩子再答一次同一題。",
        "造句題只要有合理因果、句子完整就算答對，不要求一字不差。",
        "全部五關完成後，宣布完成國語任務，簡短說出孩子最棒的地方。",
        "不要提到你是 AI，不要討論模型，不要回答跟遊戲無關的問題。若孩子跑題，溫柔拉回目前題目。",
        `固定題目如下：${JSON.stringify(questions)}`
      ].join("\n")
    }
  };

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "exam-quest-demo"
    },
    body: JSON.stringify(session)
  });
  const data = await response.json();
  if (!response.ok) {
    return error(data.error?.message || "Realtime token 建立失敗", response.status);
  }

  return json({ ...data, model });
}
