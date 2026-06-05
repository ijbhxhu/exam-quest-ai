import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  CheckCircle2,
  Download,
  FileSearch,
  Gamepad2,
  Loader2,
  Mic,
  Mic2,
  PauseCircle,
  Printer,
  Search,
  Sparkles,
  Wand2
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type SearchMatch = {
  grade: number;
  subject: string;
  publisher: string;
  semester: string;
  examSet: string;
  exam: string;
  folderUrl: string;
  sourceUrl: string;
};

type PdfFile = {
  id: string;
  name: string;
  kind: string;
  previewUrl: string;
  downloadUrl: string;
  proxyUrl: string;
};

type GameQuestion = {
  id: string;
  question: string;
  type: "choice" | "fill" | "calculation" | "reading" | "short_answer";
  choices: string[];
  answer: string;
  skill: string;
  hintSteps: string[];
  gamePrompt: string;
};

type GamePayload = {
  title: string;
  questions: GameQuestion[];
  mode?: string;
  notice?: string;
};

type JudgePayload = {
  isCorrect: boolean;
  spokenAnswer: string;
  feedback: string;
  nextHint: string;
};

type QuestionImagePayload = {
  mode: string;
  imageUrl: string;
  error?: string;
};

const examples = [
  "小三數學康軒上學期期中考",
  "三年級國語南一上學期期中考",
  "小三自然翰林上學期期中考",
  "小三社會康軒下學期期末考"
];

const mandarinVoiceGame: GamePayload = {
  title: "小三國語一問一答闖關",
  mode: "fixed",
  questions: [
    {
      id: "mandarin-1",
      question: "「仔細」的意思比較接近哪一個詞？一，馬虎。二，認真。三，快速。",
      type: "choice",
      choices: ["馬虎", "認真", "快速"],
      answer: "認真",
      skill: "詞語理解",
      hintSteps: ["仔細做事的人通常很用心。", "找一個和用心、認真接近的詞。"],
      gamePrompt: "第一關：詞語理解"
    },
    {
      id: "mandarin-2",
      question: "哪一句量詞用得比較正確？一，一本鉛筆。二，一枝鉛筆。三，一朵鉛筆。",
      type: "choice",
      choices: ["一本鉛筆", "一枝鉛筆", "一朵鉛筆"],
      answer: "一枝鉛筆",
      skill: "量詞",
      hintSteps: ["鉛筆細細長長的。", "我們平常會說一枝鉛筆。"],
      gamePrompt: "第二關：量詞選擇"
    },
    {
      id: "mandarin-3",
      question: "請用「因為，所以」說一句完整的句子。",
      type: "short_answer",
      choices: [],
      answer: "因為下雨，所以我帶雨傘。",
      skill: "因果造句",
      hintSteps: ["先說原因，再說結果。", "例如：因為下雨，所以我帶雨傘。"],
      gamePrompt: "第三關：因果造句"
    },
    {
      id: "mandarin-4",
      question: "小明每天放學後先寫功課，再去操場打球。請問小明放學後先做什麼？",
      type: "short_answer",
      choices: [],
      answer: "先寫功課",
      skill: "閱讀理解",
      hintSteps: ["注意題目中的「先」這個字。", "短文說先寫功課，再去打球。"],
      gamePrompt: "第四關：閱讀理解"
    },
    {
      id: "mandarin-5",
      question: "「七上八下」通常是形容什麼心情？一，很安心。二，很緊張。三，很想睡。",
      type: "choice",
      choices: ["很安心", "很緊張", "很想睡"],
      answer: "很緊張",
      skill: "成語理解",
      hintSteps: ["心裡七上八下，代表心情不安定。", "不安定的心情通常會緊張。"],
      gamePrompt: "第五關：成語感覺"
    }
  ]
};

function cls(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "API 呼叫失敗");
  return data;
}

function normalizeAnswer(value: string) {
  return value.replace(/\s+/g, "").replace(/[，。,.]/g, "").toLowerCase();
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-TW";
  utterance.rate = 0.95;
  utterance.pitch = 1.08;
  window.speechSynthesis.speak(utterance);
}

function hashSeed(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function localQuestionImage(question: GameQuestion, seed: string) {
  const colors = [
    ["#fff4cc", "#e6f5f2", "#ff7b7b"],
    ["#e8f0ff", "#fff0f6", "#6d5dfc"],
    ["#fef3c7", "#dcfce7", "#f59e0b"]
  ];
  const hash = hashSeed(seed);
  const picked = colors[hash % colors.length];
  const [bgA, bgB, accent] = picked;
  const bookTilt = (hash % 18) - 9;
  const pencilTilt = ((hash >> 5) % 22) - 11;
  const drift = (hash >> 9) % 80;
  const scene = hash % 4;
  const bookX = [150, 430, 240, 520][scene];
  const bookY = [76, 54, 118, 82][scene];
  const pencilX = [690, 180, 720, 270][scene];
  const pencilY = [52, 78, 112, 46][scene];
  const faceColor = ["#ff7b7b", "#6d5dfc", "#0f766e", "#f59e0b"][scene];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/>
        </linearGradient>
        <filter id="s"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#263238" flood-opacity=".20"/></filter>
      </defs>
      <rect width="1200" height="520" rx="36" fill="url(#bg)"/>
      <circle cx="130" cy="95" r="70" fill="#fffdf8" opacity=".7"/>
      <circle cx="1050" cy="120" r="96" fill="#fffdf8" opacity=".6"/>
      <rect x="${88 + drift}" y="345" width="90" height="38" rx="12" fill="${accent}" transform="rotate(-12 133 364)"/>
      <rect x="${1010 - drift}" y="328" width="76" height="38" rx="12" fill="#0f766e" transform="rotate(14 1048 347)"/>
      <circle cx="${240 + drift}" cy="420" r="18" fill="#f59e0b"/>
      <circle cx="${925 - drift}" cy="78" r="16" fill="#ef4444"/>
      <path d="M${130 + drift} 250l24 50 54 8-39 38 9 54-48-26-48 26 9-54-39-38 54-8z" fill="${faceColor}" opacity=".55"/>
      <path d="M${960 - drift} 230c62 22 80 76 44 126-46-34-72-76-44-126z" fill="#ffffff" opacity=".72" stroke="#263238" stroke-width="8"/>

      <g filter="url(#s)" transform="translate(${bookX} ${bookY}) rotate(${bookTilt})">
        <rect x="0" y="0" width="315" height="315" rx="30" fill="#fffdf8" stroke="#263238" stroke-width="9"/>
        <path d="M58 84h210M58 132h168M58 180h196" stroke="#263238" stroke-width="15" stroke-linecap="round" opacity=".16"/>
        <circle cx="112" cy="238" r="25" fill="#263238"/>
        <circle cx="224" cy="238" r="25" fill="#263238"/>
        <circle cx="121" cy="229" r="8" fill="#fff"/>
        <circle cx="233" cy="229" r="8" fill="#fff"/>
        <path d="M132 278c38 26 78 24 112-4" fill="none" stroke="#263238" stroke-width="13" stroke-linecap="round"/>
      </g>

      <g filter="url(#s)" transform="translate(${pencilX} ${pencilY}) rotate(${pencilTilt})">
        <rect x="80" y="75" width="104" height="320" rx="48" fill="${accent}" stroke="#263238" stroke-width="9"/>
        <path d="M80 142h104" stroke="#263238" stroke-width="9"/>
        <path d="M92 75l40-72 40 72z" fill="#f8d8a8" stroke="#263238" stroke-width="9"/>
        <path d="M132 8l13 32h-26z" fill="#263238"/>
        <circle cx="112" cy="238" r="16" fill="#263238"/>
        <circle cx="162" cy="238" r="16" fill="#263238"/>
        <path d="M116 284c28 20 56 18 82-5" fill="none" stroke="#263238" stroke-width="12" stroke-linecap="round"/>
      </g>

      <path d="M205 126c58-54 118-66 180-36" fill="none" stroke="#ff7b7b" stroke-width="16" stroke-linecap="round"/>
      <path d="M820 420c84 20 150 0 198-62" fill="none" stroke="#0f766e" stroke-width="16" stroke-linecap="round"/>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function renderPdfToImages(pdfUrl: string, maxPages = 2) {
  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error("PDF 讀取失敗");
  const bytes = await response.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const images: string[] = [];
  for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, maxPages); pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.82));
  }
  return images;
}

function VoiceCoach() {
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [message, setMessage] = useState("按麥克風開始小三國語一問一答闖關");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function start() {
    try {
      setStatus("connecting");
      setMessage("正在建立 Realtime 語音連線");
      const token = await api<{ value?: string; model?: string }>("/api/realtime-token");
      if (!token.value) throw new Error("沒有取得 Realtime client secret");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = document.createElement("audio");
      audio.autoplay = true;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
      };

      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = media;
      pc.addTrack(media.getTracks()[0]);

      const channel = pc.createDataChannel("oai-events");
      channel.addEventListener("open", () => {
        channel.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions: [
              "現在立刻開始小三國語闖關遊戲。",
              "先用一句話歡迎孩子，然後直接問第一關題目。",
              "問完第一題後停下來等孩子用語音回答。"
            ].join("\n")
          }
        }));
      });
      channel.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type?.includes("transcript") && payload.delta) {
            setMessage((current) => `${current}${payload.delta}`.slice(-120));
          }
          if (payload.type === "response.done") {
            setMessage("正在等孩子回答...");
          }
        } catch {
          setMessage("語音事件已收到");
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token.value}`,
          "Content-Type": "application/sdp"
        }
      });
      if (!sdpResponse.ok) throw new Error(await sdpResponse.text());
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
      setStatus("live");
      setMessage(`小三國語闖關已啟動：${token.model || "Realtime"}`);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Realtime 連線失敗");
    }
  }

  function stop() {
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    pcRef.current = null;
    streamRef.current = null;
    setStatus("idle");
    setMessage("語音闖關已停止");
  }

  return (
    <section className="voice-panel" aria-label="語音陪練">
      <div>
        <p className="eyebrow">Realtime</p>
        <h2>小三國語闖關</h2>
        <p>{message}</p>
      </div>
      <button
        className={cls("icon-button", status === "live" && "danger")}
        onClick={status === "live" ? stop : start}
        title={status === "live" ? "停止語音" : "啟動語音"}
        type="button"
      >
        {status === "connecting" ? <Loader2 className="spin" /> : status === "live" ? <PauseCircle /> : <Mic />}
      </button>
    </section>
  );
}

function GameView({ game }: { game: GamePayload }) {
  const [index, setIndex] = useState(0);
  const [imageNonce, setImageNonce] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [judges, setJudges] = useState<Record<string, JudgePayload>>({});
  const [currentImage, setCurrentImage] = useState<{ questionId: string; seed: string; url?: string }>(() => ({
    questionId: game.questions[0]?.id || "start",
    seed: crypto.randomUUID()
  }));
  const [imageLoading, setImageLoading] = useState(false);
  const [revealedHints, setRevealedHints] = useState(0);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState("按下麥克風，聽題目後直接回答。");
  const current = game.questions[index];
  const submitted = answers[current.id] || "";
  const judged = judges[current.id];
  const isCorrect = judged?.isCorrect ?? normalizeAnswer(submitted) === normalizeAnswer(current.answer);
  const completed = Object.keys(answers).length;

  useEffect(() => {
    let cancelled = false;
    const seed = crypto.randomUUID();
    setCurrentImage({ questionId: current.id, seed });
    async function loadQuestionImage() {
      setImageLoading(true);
      try {
        const payload = await api<QuestionImagePayload>("/api/question-image", {
          question: current.question,
          skill: current.skill,
          gamePrompt: current.gamePrompt,
          seed
        });
        if (!cancelled && payload.imageUrl) {
          setCurrentImage({ questionId: current.id, seed, url: payload.imageUrl });
        }
      } catch {
        // The backend has a fallback, but keep the game usable even if the request is interrupted.
      } finally {
        if (!cancelled) setImageLoading(false);
      }
    }
    void loadQuestionImage();
    return () => {
      cancelled = true;
    };
  }, [current.id, current.question, current.skill, current.gamePrompt, imageNonce]);

  const skills = useMemo(() => {
    const counts = new Map<string, number>();
    for (const question of game.questions) {
      const judgement = judges[question.id];
      const wrong = judgement ? !judgement.isCorrect : answers[question.id] && normalizeAnswer(answers[question.id]) !== normalizeAnswer(question.answer);
      if (wrong) {
        counts.set(question.skill, (counts.get(question.skill) || 0) + 1);
      }
    }
    return [...counts.entries()];
  }, [answers, judges, game.questions]);

  function submit(value: string) {
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  }

  function refreshImage() {
    setImageNonce((value) => value + 1);
  }

  function readCurrentQuestion() {
    speak(`${current.gamePrompt}。題目是：${current.question}`);
  }

  async function judgeSpokenAnswer(childAnswer: string) {
    submit(childAnswer);
    setVoiceNote(`我聽到：${childAnswer}`);
    try {
      const judgement = await api<JudgePayload>("/api/check-answer", {
        question: current.question,
        correctAnswer: current.answer,
        childAnswer,
        hintSteps: current.hintSteps,
        skill: current.skill
      });
      setJudges((prev) => ({ ...prev, [current.id]: judgement }));
      setVoiceNote(judgement.feedback);
      speak(`${judgement.feedback}${judgement.isCorrect ? "" : `提示：${judgement.nextHint}`}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI 判斷失敗";
      setVoiceNote(message);
      speak(message);
    }
  }

  function listenAnswer() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      const message = "這個瀏覽器不支援語音辨識，請改用 Chrome 或手動輸入。";
      setVoiceNote(message);
      speak(message);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-TW";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setListening(true);
      setVoiceNote("正在聽孩子回答...");
    };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript || "";
      if (transcript) void judgeSpokenAnswer(transcript);
    };
    recognition.onerror = () => {
      setListening(false);
      setVoiceNote("沒有聽清楚，可以再說一次。");
    };
    recognition.onend = () => setListening(false);
    readCurrentQuestion();
    window.setTimeout(() => recognition.start(), 900);
  }

  return (
    <section className="game-shell">
      <div className="game-map" aria-label="闖關進度">
        {game.questions.map((question, i) => (
          <button
            key={question.id}
            className={cls("map-node", i === index && "active", answers[question.id] && "done")}
            onClick={() => {
              setIndex(i);
              setRevealedHints(0);
              refreshImage();
            }}
            type="button"
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="question-stage">
        <p className="eyebrow">{game.title}</p>
        <h2>{current.gamePrompt}</h2>
        <div className="question-visual">
          {currentImage.questionId === current.id && currentImage.url ? (
            <img
              key={`${current.id}-${currentImage.seed}-api`}
              src={currentImage.url}
              alt={`${current.gamePrompt} 插圖`}
            />
          ) : (
            <div className="image-loading-state">
              <Loader2 className="spin" size={34} />
              <strong>正在呼叫 Image API 產生新圖</strong>
              <span>圖片已清空，等待新的卡通插圖回來</span>
            </div>
          )}
          {imageLoading && <span className="image-badge"><Loader2 className="spin" size={16} /> Image API call</span>}
          <button className="image-refresh" onClick={refreshImage} type="button">換新圖</button>
        </div>
        <p className="question-text">{current.question}</p>
        <div className="voice-answer">
          <button onClick={readCurrentQuestion} type="button">
            <Mic2 size={18} /> 唸題目
          </button>
          <button className={listening ? "listening" : ""} onClick={listenAnswer} type="button">
            {listening ? <Loader2 className="spin" /> : <Mic size={18} />} 語音作答
          </button>
          <span>{voiceNote}</span>
        </div>
        <div className="answer-zone">
          {current.choices.length > 0 ? (
            current.choices.map((choice) => (
              <button
                key={choice}
                className={cls("choice", submitted === choice && "selected")}
                onClick={() => submit(choice)}
                type="button"
              >
                {choice}
              </button>
            ))
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                submit(String(data.get("answer") || ""));
              }}
            >
              <input name="answer" placeholder="輸入答案" defaultValue={submitted} />
              <button type="submit">送出</button>
            </form>
          )}
        </div>

        {submitted && (
          <div className={cls("feedback", isCorrect ? "correct" : "needs-work")}>
            {isCorrect ? <CheckCircle2 /> : <Sparkles />}
            <span>{judged?.feedback || (isCorrect ? "答對了，往下一關前進。" : "先別急，打開提示再試一次。")}</span>
          </div>
        )}

        <div className="hint-box">
          <button
            type="button"
            onClick={() => setRevealedHints((value) => Math.min(value + 1, current.hintSteps.length))}
          >
            <Wand2 size={18} /> 提示卡
          </button>
          {current.hintSteps.slice(0, revealedHints).map((hint) => (
            <p key={hint}>{hint}</p>
          ))}
        </div>

        <div className="stage-actions">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => {
              setIndex((value) => Math.max(0, value - 1));
              setRevealedHints(0);
              refreshImage();
            }}
          >
            上一關
          </button>
          <button
            type="button"
            disabled={index >= game.questions.length - 1}
            onClick={() => {
              setIndex((value) => Math.min(game.questions.length - 1, value + 1));
              setRevealedHints(0);
              refreshImage();
            }}
          >
            下一關
          </button>
        </div>
      </div>

      <aside className="report-panel">
        <p className="eyebrow">家長報告</p>
        <h2>{completed}/{game.questions.length} 題已作答</h2>
        <p>{game.notice || "完成後會整理孩子需要加強的能力。"}</p>
        {skills.length > 0 ? (
          skills.map(([skill, count]) => <span className="skill-pill" key={skill}>{skill} x {count}</span>)
        ) : (
          <span className="skill-pill">目前沒有錯題</span>
        )}
      </aside>
    </section>
  );
}

function App() {
  const [query, setQuery] = useState(examples[0]);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [selected, setSelected] = useState<SearchMatch | null>(null);
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [activeFile, setActiveFile] = useState<PdfFile | null>(null);
  const [game, setGame] = useState<GamePayload | null>(mandarinVoiceGame);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function search() {
    setBusy("search");
    setNotice("");
    setGame(null);
    try {
      const result = await api<{ matches: SearchMatch[]; missing: string[] }>("/api/search", { query });
      setMatches(result.matches);
      const first = result.matches[0] || null;
      setSelected(first);
      setFiles([]);
      setActiveFile(null);
      if (first) await loadFiles(first);
      if (result.missing.length) setNotice(`還缺：${result.missing.join("、")}，目前先用可推測條件搜尋。`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "搜尋失敗");
    } finally {
      setBusy("");
    }
  }

  async function loadFiles(match: SearchMatch) {
    setBusy("files");
    setSelected(match);
    try {
      const result = await api<{ files: PdfFile[] }>("/api/files", { folderUrl: match.folderUrl });
      setFiles(result.files.slice(0, 12));
      setActiveFile(result.files.find((file) => file.kind === "試卷") || result.files[0] || null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "讀取 PDF 清單失敗");
    } finally {
      setBusy("");
    }
  }

  async function buildGame(file: PdfFile) {
    setBusy("ocr");
    setNotice("正在把 PDF 轉成題目圖片，再交給 AI 拆成關卡。");
    try {
      const images = await renderPdfToImages(file.proxyUrl, 2);
      const payload = await api<GamePayload>("/api/ocr-game", {
        images,
        pdfFileId: file.id,
        metadata: { ...selected, pdfFileId: file.id, filename: file.name }
      });
      setGame(payload);
      setActiveFile(file);
      setNotice(payload.notice || "遊戲題目已建立。");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "OCR 建立遊戲失敗");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="app">
      <section className="top-band">
        <div className="brand">
          <div className="brand-mark"><BookOpen /></div>
          <div>
            <h1>考前任務島 AI</h1>
            <p>家長一句話找試卷，孩子用闖關方式練習。</p>
          </div>
        </div>
        <VoiceCoach />
      </section>

      <section className="search-panel">
        <div>
          <p className="eyebrow">家長模式</p>
          <h2>自然語言找期中、期末試卷</h2>
        </div>
        <div className="demo-strip">
          <Gamepad2 size={18} />
          <span>最快 demo：下方已顯示小三國語第 1 關，可直接按「唸題目」與「語音作答」。</span>
          <button type="button" onClick={() => setGame(mandarinVoiceGame)}>顯示國語題目</button>
        </div>
        <div className="search-row">
          <Search className="search-icon" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
          <button onClick={search} disabled={Boolean(busy)} type="button">
            {busy === "search" ? <Loader2 className="spin" /> : <FileSearch />} 找試卷
          </button>
        </div>
        <div className="chips">
          {examples.map((example) => (
            <button key={example} onClick={() => setQuery(example)} type="button">{example}</button>
          ))}
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>

      {matches.length > 0 && (
        <section className="results-grid">
          <div className="match-list">
            <p className="eyebrow">找到的資料夾</p>
            {matches.slice(0, 6).map((match) => (
              <button
                key={match.folderUrl}
                className={cls("match-item", selected?.folderUrl === match.folderUrl && "active")}
                onClick={() => loadFiles(match)}
                type="button"
              >
                <strong>小{match.grade} {match.subject} {match.publisher}</strong>
                <span>{match.semester} / {match.exam} / {match.examSet}</span>
              </button>
            ))}
          </div>

          <div className="file-list">
            <p className="eyebrow">PDF 清單</p>
            {busy === "files" && <p className="notice">正在讀取 Google Drive PDF...</p>}
            {files.map((file, fileIndex) => (
              <article key={`${file.id}-${fileIndex}`} className={cls("file-item", activeFile?.id === file.id && "active")}>
                <div>
                  <span className={cls("tag", file.kind === "試卷" ? "paper" : "answer")}>{file.kind}</span>
                  <h3>{file.name}</h3>
                </div>
                <div className="file-actions">
                  <a href={file.proxyUrl} title="下載 PDF"><Download /></a>
                  <a href={file.previewUrl} target="_blank" rel="noreferrer" title="預覽列印"><Printer /></a>
                  <button onClick={() => buildGame(file)} type="button" title="變成遊戲">
                    {busy === "ocr" && activeFile?.id === file.id ? <Loader2 className="spin" /> : <Gamepad2 />}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {game && <GameView game={game} />}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
