import { error, handleOptions, json, readJson } from "../_lib/http.js";
import { getPublicQuestionPack, markOcrFailed, saveQuestionPack } from "../_lib/data.js";
import { makeId } from "../_lib/id.js";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "questions"],
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "type", "choices", "answer", "skill", "hintSteps", "gamePrompt"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          type: { type: "string", enum: ["choice", "fill", "calculation", "reading", "short_answer"] },
          choices: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
          skill: { type: "string" },
          hintSteps: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
          gamePrompt: { type: "string" }
        }
      }
    }
  }
};

function demoGame(metadata = {}) {
  const subject = metadata.subject || "數學";
  return {
    mode: "demo",
    title: `${subject}考前小任務`,
    questions: [
      {
        id: "q1",
        question: "248 + 137 = ?",
        type: "calculation",
        choices: [],
        answer: "385",
        skill: "三位數加法與進位",
        hintSteps: ["先算個位數。", "8 加 7 等於 15，要進 1。", "再算十位和百位。"],
        gamePrompt: "通過第 1 關：幫任務島點亮第一座燈塔。"
      },
      {
        id: "q2",
        question: "下列哪一個詞語和「仔細」意思最接近？",
        type: "choice",
        choices: ["馬虎", "認真", "快速", "安靜"],
        answer: "認真",
        skill: "詞語理解",
        hintSteps: ["先想想「仔細」做事情時是什麼樣子。", "找一個表示很用心的詞。"],
        gamePrompt: "通過第 2 關：選出正確詞語，打開城門。"
      },
      {
        id: "q3",
        question: "一枝鉛筆 8 元，買 6 枝要多少元？",
        type: "calculation",
        choices: [],
        answer: "48",
        skill: "乘法應用題",
        hintSteps: ["買 6 枝就是 6 個 8 元。", "可以用 8 乘以 6。"],
        gamePrompt: "通過第 3 關：算出補給品金額。"
      }
    ]
  };
}

export async function onRequest(context) {
  const options = handleOptions(context.request);
  if (options) return options;

  const { images = [], metadata = {}, pdfFileId = metadata?.pdfFileId } = await readJson(context.request);
  if (pdfFileId && context.env.EXAM_DB?.prepare && context.env.PDF_BUCKET?.get) {
    const existing = await getPublicQuestionPack(context.env, pdfFileId);
    if (existing?.r2_json_key) {
      const object = await context.env.PDF_BUCKET.get(existing.r2_json_key);
      if (object) {
        const cached = await object.json();
        return json({ mode: "cached", ...cached });
      }
    }
  }

  if (!Array.isArray(images) || images.length === 0) {
    return json(demoGame(metadata));
  }

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = { ...demoGame(metadata), notice: "尚未設定 OPENAI_API_KEY，因此目前使用 demo 題。" };
    return json(fallback);
  }

  const model = context.env.OPENAI_OCR_MODEL || "gpt-5.4-mini";
  const content = [
    {
      type: "input_text",
      text: [
        "你是一位台灣國小考前陪練老師。",
        "請讀取試卷圖片，抽出最多 8 題適合互動練習的題目。",
        "不要捏造看不到的題目。若題目沒有標準答案，請根據題目內容推估合理答案並標明簡短技能。",
        "把每題改寫成孩子願意接受的闖關語氣，但保留原始題意。",
        `背景：${JSON.stringify(metadata)}`
      ].join("\n")
    },
    ...images.slice(0, 3).map((imageUrl) => ({
      type: "input_image",
      image_url: imageUrl,
      detail: "high"
    }))
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "exam_game_questions",
          strict: true,
          schema
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    await markOcrFailed(context.env, pdfFileId, data.error?.message || `OpenAI OCR failed: ${response.status}`);
    return error(data.error?.message || "OpenAI OCR 失敗", response.status);
  }

  const text = data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!text) return error("OpenAI 回傳格式中沒有題目 JSON", 502, { raw: data });

  try {
    const parsed = JSON.parse(text);
    if (pdfFileId && context.env.EXAM_DB?.prepare && context.env.PDF_BUCKET?.put) {
      const packId = makeId("qp");
      const key = `question-packs/${pdfFileId}/${packId}.json`;
      await context.env.PDF_BUCKET.put(key, JSON.stringify(parsed), {
        httpMetadata: { contentType: "application/json; charset=utf-8" }
      });
      await saveQuestionPack(context.env, {
        id: packId,
        pdfFileId,
        title: parsed.title || "考前小任務",
        grade: metadata.grade,
        subject: metadata.subject,
        r2JsonKey: key,
        questionCount: parsed.questions?.length || 0,
        visibility: "public"
      });
      return json({ mode: "openai", questionPackId: packId, ...parsed });
    }
    return json({ mode: "openai", ...parsed });
  } catch (err) {
    await markOcrFailed(context.env, pdfFileId, err.message || "Question JSON parse failed");
    return error("題目 JSON 解析失敗", 502, { rawText: text });
  }
}
