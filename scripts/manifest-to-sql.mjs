#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const manifestPath = process.argv.find((item) => item.startsWith("--manifest="))?.split("=")[1] || "data/pdf-manifest.json";
const outPath = process.argv.find((item) => item.startsWith("--out="))?.split("=")[1] || "data/import-pdfs.sql";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function sql(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const lines = [
  "PRAGMA foreign_keys = ON;",
  "INSERT OR IGNORE INTO exam_sources (id, name, type, source_url) VALUES ('melances', 'Melances Test Bank', 'melances', 'https://melances.com/test-bank/');"
];

for (const folder of manifest.folders || []) {
  lines.push(`INSERT INTO drive_folders (id, source_id, grade, subject, publisher, semester, exam_set, exam_type, folder_url, last_scanned_at)
VALUES (${sql(folder.folderId)}, 'melances', ${Number(folder.grade)}, ${sql(folder.subject)}, ${sql(folder.publisher)}, ${sql(folder.semester)}, ${sql(folder.examSet)}, ${sql(folder.examType)}, ${sql(folder.folderUrl)}, datetime('now'))
ON CONFLICT(folder_url) DO UPDATE SET last_scanned_at = datetime('now');`);
}

for (const file of manifest.files || []) {
  lines.push(`INSERT INTO pdf_files (
  id, drive_file_id, folder_id, filename, kind, grade, subject, publisher, semester, exam_type,
  source_url, preview_url, download_url, r2_key, sha256, size_bytes, mirror_status, ocr_status, updated_at
) VALUES (
  ${sql(file.id)}, ${sql(file.driveFileId)}, ${sql(file.folderId)}, ${sql(file.filename)}, ${sql(file.kind)},
  ${Number(file.grade)}, ${sql(file.subject)}, ${sql(file.publisher)}, ${sql(file.semester)}, ${sql(file.examType)},
  ${sql(file.sourceUrl)}, ${sql(file.previewUrl)}, ${sql(file.downloadUrl)}, ${sql(file.r2Key)}, ${sql(file.sha256)}, ${file.sizeBytes || "NULL"},
  ${sql(file.mirrorStatus || "pending")}, 'pending', datetime('now')
) ON CONFLICT(drive_file_id) DO UPDATE SET
  filename = excluded.filename,
  folder_id = excluded.folder_id,
  r2_key = excluded.r2_key,
  sha256 = COALESCE(excluded.sha256, pdf_files.sha256),
  size_bytes = COALESCE(excluded.size_bytes, pdf_files.size_bytes),
  mirror_status = excluded.mirror_status,
  updated_at = datetime('now');`);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${lines.join("\n\n")}\n`);
console.log(`wrote ${outPath}`);
console.log(`folders=${manifest.folders?.length || 0} pdfs=${manifest.files?.length || 0}`);
