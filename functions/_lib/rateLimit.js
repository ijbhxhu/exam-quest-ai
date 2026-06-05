import { makeId, sha256Hex } from "./id.js";

function getIp(request) {
  return request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "local";
}

function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function enforceDailyDownloadLimit({ env, request, pdfFileId }) {
  const limit = Number(env.PDF_DAILY_LIMIT || 30);
  if (!env?.EXAM_DB?.prepare || !limit || limit < 1) {
    return { allowed: true, limit, remaining: null };
  }

  const ipHash = await sha256Hex(`${getIp(request)}:${env.DOWNLOAD_LIMIT_SALT || "exam-quest-ai"}`);
  const dayKey = getDayKey();
  const row = await env.EXAM_DB.prepare(`
    SELECT COUNT(*) AS count
    FROM download_events
    WHERE ip_hash = ?1 AND day_key = ?2
  `).bind(ipHash, dayKey).first();
  const count = Number(row?.count || 0);
  if (count >= limit) {
    return { allowed: false, limit, remaining: 0, count };
  }

  await env.EXAM_DB.prepare(`
    INSERT INTO download_events (id, pdf_file_id, ip_hash, day_key)
    VALUES (?1, ?2, ?3, ?4)
  `).bind(makeId("dl"), pdfFileId || null, ipHash, dayKey).run();

  return { allowed: true, limit, remaining: Math.max(0, limit - count - 1), count: count + 1 };
}
