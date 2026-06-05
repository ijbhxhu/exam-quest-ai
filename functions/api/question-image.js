import { error, handleOptions, json, readJson } from "../_lib/http.js";

function noStore(data) {
  return json(data, {
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate"
    }
  });
}

function seedHash(seed) {
  let hash = 0;
  for (const char of String(seed || crypto.randomUUID())) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function fallbackSvg({ question = "國語闖關", skill = "小三國語", seed }) {
  const palette = [
    ["#fff4cc", "#e6f5f2", "#ff7b7b"],
    ["#e8f0ff", "#fff0f6", "#6d5dfc"],
    ["#fef3c7", "#dcfce7", "#f59e0b"],
    ["#f0f9ff", "#fae8ff", "#0ea5e9"]
  ];
  const hash = seedHash(seed);
  const index = hash % palette.length;
  const [bgA, bgB, accent] = palette[index];
  const bookTilt = (hash % 18) - 9;
  const pencilTilt = ((hash >> 5) % 22) - 11;
  const shift = (hash >> 9) % 70;
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="${bgA}"/>
        <stop offset="1" stop-color="${bgB}"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#263238" flood-opacity=".18"/>
      </filter>
    </defs>
    <rect width="1024" height="1024" rx="56" fill="url(#bg)"/>
    <circle cx="176" cy="192" r="118" fill="#fffdf8" opacity=".72"/>
    <circle cx="860" cy="188" r="144" fill="#fffdf8" opacity=".58"/>
    <circle cx="830" cy="812" r="96" fill="${accent}" opacity=".18"/>

    <g opacity=".9">
      <rect x="${114 + shift}" y="126" width="42" height="42" rx="10" fill="${accent}" transform="rotate(-12 135 147)"/>
      <rect x="${826 - shift}" y="318" width="40" height="40" rx="10" fill="#0f766e" transform="rotate(17 846 338)"/>
      <circle cx="${235 + shift}" cy="796" r="22" fill="#f59e0b"/>
      <circle cx="${744 - shift}" cy="118" r="18" fill="#ef4444"/>
      <path d="M116 642l52 24-46 34z" fill="#22c55e"/>
      <path d="M886 600l-46 24 6-52z" fill="#3b82f6"/>
      <path d="M280 132c24 40 58 42 82 0" fill="none" stroke="#263238" stroke-width="12" stroke-linecap="round"/>
      <path d="M680 876c24-40 58-42 82 0" fill="none" stroke="#263238" stroke-width="12" stroke-linecap="round"/>
    </g>

    <g filter="url(#shadow)">
      <path d="M198 760c88-112 236-156 378-124 118 26 214 6 310-74 10 144-74 270-220 314-152 46-342 8-468-116z" fill="#fffdf8" stroke="#263238" stroke-width="10"/>
    </g>

    <g filter="url(#shadow)">
      <rect x="276" y="262" width="290" height="336" rx="34" fill="#ffffff" stroke="#263238" stroke-width="10" transform="rotate(${bookTilt} 421 430)"/>
      <path d="M326 338h178M320 408h192M326 478h146" stroke="#263238" stroke-width="18" stroke-linecap="round" opacity=".18"/>
      <circle cx="372" cy="558" r="30" fill="#263238"/>
      <circle cx="500" cy="540" r="30" fill="#263238"/>
      <circle cx="382" cy="548" r="9" fill="#fff"/>
      <circle cx="510" cy="530" r="9" fill="#fff"/>
      <path d="M410 600c34 28 74 24 104-10" fill="none" stroke="#263238" stroke-width="14" stroke-linecap="round"/>
      <path d="M276 474c-56 18-86 62-88 116" fill="none" stroke="#263238" stroke-width="16" stroke-linecap="round"/>
      <path d="M562 432c62 8 108 42 138 102" fill="none" stroke="#263238" stroke-width="16" stroke-linecap="round"/>
    </g>

    <g filter="url(#shadow)" transform="rotate(${pencilTilt} 645 440)">
      <rect x="598" y="214" width="110" height="456" rx="52" fill="${accent}" stroke="#263238" stroke-width="10"/>
      <path d="M598 288h110" stroke="#263238" stroke-width="10"/>
      <path d="M618 214l36-74 34 74z" fill="#f8d8a8" stroke="#263238" stroke-width="10"/>
      <path d="M654 142l12 34h-26z" fill="#263238"/>
      <circle cx="632" cy="422" r="17" fill="#263238"/>
      <circle cx="680" cy="422" r="17" fill="#263238"/>
      <path d="M636 474c28 20 56 20 82-4" fill="none" stroke="#263238" stroke-width="12" stroke-linecap="round"/>
      <path d="M606 544c-52 2-82 30-102 82" fill="none" stroke="#263238" stroke-width="14" stroke-linecap="round"/>
      <path d="M704 528c48-20 90-10 128 28" fill="none" stroke="#263238" stroke-width="14" stroke-linecap="round"/>
    </g>

    <g>
      <path d="M350 212c46-64 106-90 180-78" fill="none" stroke="#ff7b7b" stroke-width="18" stroke-linecap="round"/>
      <path d="M372 176l-30 8 12-28" fill="#ff7b7b"/>
      <path d="M820 462c44 54 42 118-6 190" fill="none" stroke="#0f766e" stroke-width="18" stroke-linecap="round"/>
      <path d="M838 628l-18 30-18-30" fill="#0f766e"/>
    </g>
  </svg>`;
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

export async function onRequest(context) {
  const options = handleOptions(context.request);
  if (options) return options;

  const body = await readJson(context.request);
  const { question, skill, gamePrompt } = body;
  if (!question) return error("缺少 question");

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) return noStore({ mode: "fallback", imageUrl: fallbackSvg(body) });

  const seed = body.seed || crypto.randomUUID();
  const prompt = [
    "Create a fancy, cute, funny cartoon illustration for an elementary quiz adventure game.",
    "Style: chibi cartoon, sticker-like, colorful, playful, polished app-game art.",
    "Include a silly smiling pencil character and a cheerful open book character doing an adventure challenge.",
    "Make it humorous and encouraging, with stars, confetti, game level energy, and soft rounded shapes.",
    "No readable text in the image. No real children. No exam paper. No scary elements.",
    `Fresh variation seed: ${seed}. Make this composition visually different from previous attempts.`,
    `Quiz theme: ${gamePrompt || skill || "Mandarin practice"}.`,
    `Question meaning: ${question}`
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: context.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini",
      prompt,
      size: "1024x1024"
    })
    });
  } catch (err) {
    clearTimeout(timeout);
    return noStore({ mode: "fallback", error: "image timeout", imageUrl: fallbackSvg(body) });
  }
  clearTimeout(timeout);

  const data = await response.json();
  if (!response.ok) {
    return noStore({
      mode: "fallback",
      error: data.error?.message || "Image generation failed",
      imageUrl: fallbackSvg(body)
    });
  }

  const b64 = data.data?.[0]?.b64_json;
  const url = data.data?.[0]?.url;
  return noStore({
    mode: b64 ? "openai-b64" : "openai-url",
    imageUrl: b64 ? `data:image/png;base64,${b64}` : url
  });
}
