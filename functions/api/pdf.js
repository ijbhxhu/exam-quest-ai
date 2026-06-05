import { corsHeaders, error, handleOptions } from "../_lib/http.js";
import { getPdfByAnyId } from "../_lib/data.js";
import { enforceDailyDownloadLimit } from "../_lib/rateLimit.js";

function r2KeyCandidates(key) {
  const keys = [key];
  try {
    const decoded = decodeURIComponent(key);
    if (decoded !== key) keys.push(decoded);
  } catch {
    // Keep the original key if it is not URI encoded.
  }
  return keys;
}

export async function onRequest(context) {
  const options = handleOptions(context.request);
  if (options) return options;

  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const name = url.searchParams.get("name") || "exam.pdf";
  if (!id || !/^[A-Za-z0-9_-]{8,}$/.test(id)) return error("缺少有效的 PDF id");

  const indexedPdf = await getPdfByAnyId(context.env, id);
  const limit = await enforceDailyDownloadLimit({ env: context.env, request: context.request, pdfFileId: indexedPdf?.id || id });
  if (!limit.allowed) {
    return error(`今天 PDF 下載已達上限 ${limit.limit} 份，明天可以再下載。`, 429, {
      limit: limit.limit,
      remaining: limit.remaining
    });
  }

  if (indexedPdf?.r2_key && context.env.PDF_BUCKET?.get) {
    for (const key of r2KeyCandidates(indexedPdf.r2_key)) {
      const object = await context.env.PDF_BUCKET.get(key);
      if (!object) continue;
      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", object.httpMetadata?.contentType || "application/pdf");
      headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(indexedPdf.filename || name)}"`);
      headers.set("Cache-Control", "private, max-age=0, no-store");
      if (indexedPdf.size_bytes) headers.set("Content-Length", String(indexedPdf.size_bytes));
      headers.set("X-Download-Limit", String(limit.limit));
      headers.set("X-PDF-Source", "r2");
      if (limit.remaining !== null) headers.set("X-Download-Remaining", String(limit.remaining));
      return new Response(object.body, { headers });
    }
  }

  const driveId = indexedPdf?.drive_file_id || id;
  if (!/^[A-Za-z0-9_-]{20,}$/.test(driveId)) return error("這份 PDF 尚未 mirror 到 R2，且沒有有效 Drive id", 404);
  const driveUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&authuser=0`;
  const response = await fetch(driveUrl, {
    headers: {
      "User-Agent": "ExamQuestAI/1.0"
    }
  });
  if (!response.ok) return error(`PDF 下載失敗：${response.status}`, 502);

  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", response.headers.get("Content-Type") || "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(indexedPdf?.filename || name)}"`);
  headers.set("Cache-Control", "private, max-age=0, no-store");
  headers.set("X-Download-Limit", String(limit.limit));
  headers.set("X-PDF-Source", indexedPdf?.r2_key ? "drive-fallback" : "drive");
  if (limit.remaining !== null) headers.set("X-Download-Remaining", String(limit.remaining));
  return new Response(response.body, { headers });
}
