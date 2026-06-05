import { error, handleOptions, json, readJson } from "../_lib/http.js";

const judgeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["isCorrect", "spokenAnswer", "feedback", "nextHint"],
  properties: {
    isCorrect: { type: "boolean" },
    spokenAnswer: { type: "string" },
    feedback: { type: "string" },
    nextHint: { type: "string" }
  }
};

function chineseNumberToArabic(input) {
  const text = String(input || "").replace(/[零〇]/g, "0");
  if (!/[一二三四五六七八九十百千萬]/.test(text)) return text;
  const digit = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const unit = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };
  let section = 0;
  let number = 0;
  let total = 0;
  for (const char of text) {
    if (digit[char]) {
      number = digit[char];
    } else if (unit[char]) {
      const base = number || 1;
      if (unit[char] === 10000) {
        total += (section + base) * unit[char];
        section = 0;
      } else {
        section += base * unit[char];
      }
      number = 0;
    }
  }
  return String(total + section + number);
}

function norm(value) {
  const stripped = String(value || "")
    .replace(/\s+/g, "")
    .replace(/[，。,.元個枝盒彩]/g, "")
    .toLowerCase();
  return chineseNumberToArabic(stripped);
}

function fallbackJudge({ childAnswer, correctAnswer, hintSteps = [] }) {
  const isCorrect = norm(childAnswer) === norm(correctAnswer);
  return {
    isCorrect,
    spokenAnswer: childAnswer,
    feedback: isCorrect ? "答對了，很棒。我們往下一關前進。" : "還差一點點。先聽提示，再試一次。",
    nextHint: hintSteps[0] || "先把題目中的關鍵數字圈起來。"
  };
}

export async function onRequest(context) {
  const options = handleOptions(context.request);
  if (options) return options;

  const body = await readJson(context.request);
  const { question, correctAnswer, childAnswer, hintSteps = [], skill = "" } = body;
  if (!question || !correctAnswer || !childAnswer) {
    return error("缺少 question、correctAnswer 或 childAnswer");
  }

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ mode: "fallback", ...fallbackJudge(body) });
  }

  const model = context.env.OPENAI_OCR_MODEL || "gpt-5.4-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "你是台灣國小學生的語音答題判斷老師。",
                "請判斷孩子口說答案是否和標準答案等價。數字可接受中文數字、單位、口誤補詞。",
                "回饋要用繁體中文，短句，溫柔鼓勵。答錯時不要直接罵，給一個下一步提示。",
                `能力：${skill}`,
                `題目：${question}`,
                `標準答案：${correctAnswer}`,
                `孩子口說答案：${childAnswer}`,
                `可用提示：${JSON.stringify(hintSteps)}`
              ].join("\n")
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "voice_answer_judgement",
          strict: true,
          schema: judgeSchema
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) return error(data.error?.message || "AI 判斷失敗", response.status);
  const text = data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!text) return error("AI 沒有回傳判斷 JSON", 502);

  try {
    return json({ mode: "openai", ...JSON.parse(text) });
  } catch {
    return error("AI 判斷 JSON 解析失敗", 502, { rawText: text });
  }
}
