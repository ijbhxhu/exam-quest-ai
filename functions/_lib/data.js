import { parseNaturalQuery } from "./examBank.js";

function hasDb(env) {
  return Boolean(env?.EXAM_DB?.prepare);
}

function normalizeKind(kind) {
  if (kind === "答案" || kind === "answer") return "answer";
  if (kind === "試卷" || kind === "exam") return "exam";
  return "other";
}

function publicKind(kind) {
  if (kind === "answer") return "答案";
  if (kind === "exam") return "試卷";
  return "其他";
}

export function dbAvailable(env) {
  return hasDb(env);
}

export async function searchIndexedExamBank(env, rawQuery) {
  if (!hasDb(env)) return null;
  const intent = parseNaturalQuery(rawQuery);
  const missing = [];
  if (!intent.subject) missing.push("科目");
  if (!intent.publisher) missing.push("版本");

  const conditions = ["grade = ?1", "semester = ?2", "exam_type = ?3"];
  const params = [intent.grade, intent.semester, intent.exam];
  if (intent.subject) {
    conditions.push("subject LIKE ?4");
    params[3] = `%${intent.subject}%`;
  }
  if (intent.publisher) {
    conditions.push(`publisher LIKE ?${params.length + 1}`);
    params.push(`%${intent.publisher}%`);
  }

  const result = await env.EXAM_DB.prepare(`
    SELECT folder_id, grade, subject, publisher, semester, exam_type, source_url, COUNT(*) AS file_count
    FROM pdf_files
    WHERE ${conditions.join(" AND ")}
    GROUP BY folder_id, grade, subject, publisher, semester, exam_type, source_url
    ORDER BY file_count DESC, subject ASC, publisher ASC
    LIMIT 20
  `).bind(...params).all();

  return {
    mode: "d1",
    intent,
    missing,
    matches: (result.results || []).map((row) => ({
      grade: row.grade,
      subject: row.subject,
      publisher: row.publisher,
      semester: row.semester,
      examSet: "",
      exam: row.exam_type,
      folderId: row.folder_id,
      folderUrl: row.folder_id,
      sourceUrl: row.source_url,
      fileCount: row.file_count
    }))
  };
}

export async function listIndexedPdfs(env, { folderId, folderUrl }) {
  if (!hasDb(env)) return null;
  const value = folderId || folderUrl;
  if (!value) return { folderId: null, files: [] };
  const result = await env.EXAM_DB.prepare(`
    SELECT id, drive_file_id, filename, kind, preview_url, download_url, r2_key, mirror_status, size_bytes
    FROM pdf_files
    WHERE folder_id = ?1 OR source_url = ?1
    ORDER BY
      CASE kind WHEN 'exam' THEN 0 WHEN 'answer' THEN 1 ELSE 2 END,
      filename DESC
    LIMIT 80
  `).bind(value).all();

  return {
    mode: "d1",
    folderId: value,
    files: (result.results || []).map((row) => ({
      id: row.id,
      driveFileId: row.drive_file_id,
      name: row.filename,
      kind: publicKind(row.kind),
      sizeBytes: row.size_bytes,
      mirrorStatus: row.mirror_status,
      previewUrl: row.preview_url || "",
      downloadUrl: "",
      proxyUrl: `/api/pdf?id=${encodeURIComponent(row.id)}`
    }))
  };
}

export async function getPdfByAnyId(env, id) {
  if (!hasDb(env)) return null;
  const result = await env.EXAM_DB.prepare(`
    SELECT *
    FROM pdf_files
    WHERE id = ?1 OR drive_file_id = ?1
    LIMIT 1
  `).bind(id).first();
  return result || null;
}

export async function upsertPdfFile(env, file) {
  if (!hasDb(env)) return null;
  const kind = normalizeKind(file.kind);
  await env.EXAM_DB.prepare(`
    INSERT INTO pdf_files (
      id, drive_file_id, folder_id, filename, kind, grade, subject, publisher, semester, exam_type,
      source_url, preview_url, download_url, r2_key, sha256, size_bytes, mirror_status, ocr_status,
      last_error, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, datetime('now'))
    ON CONFLICT(drive_file_id) DO UPDATE SET
      folder_id = excluded.folder_id,
      filename = excluded.filename,
      kind = excluded.kind,
      grade = excluded.grade,
      subject = excluded.subject,
      publisher = excluded.publisher,
      semester = excluded.semester,
      exam_type = excluded.exam_type,
      source_url = excluded.source_url,
      preview_url = excluded.preview_url,
      download_url = excluded.download_url,
      r2_key = COALESCE(excluded.r2_key, pdf_files.r2_key),
      sha256 = COALESCE(excluded.sha256, pdf_files.sha256),
      size_bytes = COALESCE(excluded.size_bytes, pdf_files.size_bytes),
      mirror_status = excluded.mirror_status,
      ocr_status = excluded.ocr_status,
      last_error = excluded.last_error,
      updated_at = datetime('now')
  `).bind(
    file.id,
    file.driveFileId,
    file.folderId,
    file.filename,
    kind,
    file.grade,
    file.subject,
    file.publisher,
    file.semester,
    file.examType,
    file.sourceUrl || null,
    file.previewUrl || null,
    file.downloadUrl || null,
    file.r2Key || null,
    file.sha256 || null,
    file.sizeBytes || null,
    file.mirrorStatus || "pending",
    file.ocrStatus || "pending",
    file.lastError || null
  ).run();
}

export async function getPublicQuestionPack(env, pdfFileId) {
  if (!hasDb(env)) return null;
  return await env.EXAM_DB.prepare(`
    SELECT qp.*
    FROM question_packs qp
    WHERE qp.pdf_file_id = ?1 AND qp.visibility = 'public'
    ORDER BY qp.created_at DESC
    LIMIT 1
  `).bind(pdfFileId).first();
}

export async function saveQuestionPack(env, pack) {
  if (!hasDb(env)) return null;
  await env.EXAM_DB.prepare(`
    INSERT INTO question_packs (id, pdf_file_id, title, grade, subject, r2_json_key, question_count, visibility)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  `).bind(
    pack.id,
    pack.pdfFileId,
    pack.title,
    pack.grade || null,
    pack.subject || null,
    pack.r2JsonKey,
    pack.questionCount || 0,
    pack.visibility || "public"
  ).run();

  await env.EXAM_DB.prepare(`
    UPDATE pdf_files
    SET ocr_status = 'done', public_question_pack_id = ?1, updated_at = datetime('now')
    WHERE id = ?2
  `).bind(pack.id, pack.pdfFileId).run();
}

export async function markOcrFailed(env, pdfFileId, message) {
  if (!hasDb(env) || !pdfFileId) return;
  await env.EXAM_DB.prepare(`
    UPDATE pdf_files
    SET ocr_status = 'failed', last_error = ?1, updated_at = datetime('now')
    WHERE id = ?2
  `).bind(String(message || "OCR failed").slice(0, 500), pdfFileId).run();
}
