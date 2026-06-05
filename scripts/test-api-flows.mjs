#!/usr/bin/env node
import assert from "node:assert/strict";
import { onRequest as pdfHandler } from "../functions/api/pdf.js";
import { onRequest as ocrHandler } from "../functions/api/ocr-game.js";
import { listIndexedPdfs, searchIndexedExamBank } from "../functions/_lib/data.js";

class MockStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async first() {
    if (this.sql.includes("FROM pdf_files") && this.sql.includes("WHERE id = ?1 OR drive_file_id = ?1")) {
      const id = this.params[0];
      return this.db.pdfFiles.find((file) => file.id === id || file.drive_file_id === id) || null;
    }
    if (this.sql.includes("COUNT(*) AS count") && this.sql.includes("FROM download_events")) {
      const [ipHash, dayKey] = this.params;
      return { count: this.db.downloadEvents.filter((event) => event.ip_hash === ipHash && event.day_key === dayKey).length };
    }
    if (/FROM question_packs qp/s.test(this.sql)) {
      const pdfFileId = this.params[0];
      return this.db.questionPacks.find((pack) => pack.pdf_file_id === pdfFileId && pack.visibility === "public") || null;
    }
    throw new Error(`Unhandled first SQL: ${this.sql}`);
  }

  async all() {
    if (this.sql.includes("FROM pdf_files") && this.sql.includes("WHERE grade = ?1")) {
      const [grade, semester, examType, subjectLike, publisherLike] = this.params;
      const subject = subjectLike?.replaceAll("%", "");
      const publisher = publisherLike?.replaceAll("%", "");
      const rows = this.db.pdfFiles.filter((file) =>
        file.grade === grade &&
        file.semester === semester &&
        file.exam_type === examType &&
        (!subject || file.subject.includes(subject)) &&
        (!publisher || file.publisher.includes(publisher))
      );
      const grouped = new Map();
      for (const file of rows) {
        const key = [file.folder_id, file.grade, file.subject, file.publisher, file.semester, file.exam_type, file.source_url].join("|");
        grouped.set(key, {
          folder_id: file.folder_id,
          grade: file.grade,
          subject: file.subject,
          publisher: file.publisher,
          semester: file.semester,
          exam_type: file.exam_type,
          source_url: file.source_url,
          file_count: (grouped.get(key)?.file_count || 0) + 1
        });
      }
      return { results: [...grouped.values()] };
    }
    if (this.sql.includes("FROM pdf_files") && this.sql.includes("WHERE folder_id = ?1 OR source_url = ?1")) {
      const value = this.params[0];
      return { results: this.db.pdfFiles.filter((file) => file.folder_id === value || file.source_url === value) };
    }
    throw new Error(`Unhandled all SQL: ${this.sql}`);
  }

  async run() {
    if (/INSERT INTO download_events/s.test(this.sql)) {
      const [id, pdfFileId, ipHash, dayKey] = this.params;
      this.db.downloadEvents.push({ id, pdf_file_id: pdfFileId, ip_hash: ipHash, day_key: dayKey });
      return { success: true };
    }
    if (/UPDATE pdf_files\s+SET ocr_status = 'done'/s.test(this.sql)) {
      const [packId, pdfFileId] = this.params;
      const file = this.db.pdfFiles.find((item) => item.id === pdfFileId);
      if (file) {
        file.ocr_status = "done";
        file.public_question_pack_id = packId;
      }
      return { success: true };
    }
    if (/INSERT INTO question_packs/s.test(this.sql)) {
      const [id, pdfFileId, title, grade, subject, r2JsonKey, questionCount, visibility] = this.params;
      this.db.questionPacks.push({
        id,
        pdf_file_id: pdfFileId,
        title,
        grade,
        subject,
        r2_json_key: r2JsonKey,
        question_count: questionCount,
        visibility
      });
      return { success: true };
    }
    if (/UPDATE pdf_files\s+SET ocr_status = 'failed'/s.test(this.sql)) return { success: true };
    throw new Error(`Unhandled run SQL: ${this.sql}`);
  }
}

class MockD1 {
  constructor(seed) {
    this.pdfFiles = seed.pdfFiles;
    this.downloadEvents = [];
    this.questionPacks = seed.questionPacks || [];
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

class MockR2Object {
  constructor(body, metadata = {}) {
    this.body = new Blob([body]).stream();
    this.bodyText = body;
    this.httpMetadata = metadata;
  }

  async json() {
    return JSON.parse(this.bodyText);
  }
}

class MockR2 {
  constructor(objects = {}) {
    this.objects = new Map(Object.entries(objects));
    this.puts = [];
  }

  async get(key) {
    return this.objects.get(key) || null;
  }

  async put(key, value, options) {
    this.puts.push({ key, value, options });
    this.objects.set(key, new MockR2Object(value, options?.httpMetadata));
  }
}

const pdfFile = {
  id: "pdf_test123",
  drive_file_id: "drive_test_abcdefghijklmnopqrstuvwxyz",
  folder_id: "folder_3_math",
  filename: "小三數學康軒期中.pdf",
  kind: "exam",
  grade: 3,
  subject: "數學",
  publisher: "康軒",
  semester: "上學期",
  exam_type: "期中考",
  source_url: "https://drive.google.com/drive/folders/folder_3_math",
  preview_url: "https://drive.google.com/file/d/drive_test/view",
  download_url: "https://drive.usercontent.google.com/download?id=drive_test",
  r2_key: "pdf/grade-3/math/sample.pdf",
  mirror_status: "mirrored",
  size_bytes: 11,
  ocr_status: "pending"
};

const db = new MockD1({ pdfFiles: [pdfFile] });
const bucket = new MockR2({
  [pdfFile.r2_key]: new MockR2Object("hello world", { contentType: "application/pdf" })
});
const env = {
  EXAM_DB: db,
  PDF_BUCKET: bucket,
  PDF_DAILY_LIMIT: "1",
  DOWNLOAD_LIMIT_SALT: "test-salt"
};

const search = await searchIndexedExamBank(env, "小三數學康軒上學期期中考");
assert.equal(search.mode, "d1");
assert.equal(search.matches.length, 1);
assert.equal(search.matches[0].folderId, "folder_3_math");

const files = await listIndexedPdfs(env, { folderId: "folder_3_math" });
assert.equal(files.files.length, 1);
assert.equal(files.files[0].proxyUrl, "/api/pdf?id=pdf_test123");

const request = new Request("https://example.com/api/pdf?id=pdf_test123", {
  headers: { "CF-Connecting-IP": "203.0.113.9" }
});
const pdfResponse = await pdfHandler({ request, env });
assert.equal(pdfResponse.status, 200);
assert.equal(pdfResponse.headers.get("X-Download-Limit"), "1");
assert.equal(pdfResponse.headers.get("X-Download-Remaining"), "0");
assert.equal(await pdfResponse.text(), "hello world");

const limitedResponse = await pdfHandler({ request, env });
assert.equal(limitedResponse.status, 429);

const cachedPack = {
  title: "快取題包",
  questions: [
    {
      id: "q1",
      question: "1 + 1 = ?",
      type: "calculation",
      choices: [],
      answer: "2",
      skill: "加法",
      hintSteps: ["先數一個。", "再多一個。"],
      gamePrompt: "第一關"
    }
  ]
};
bucket.objects.set("question-packs/pdf_test123/pack.json", new MockR2Object(JSON.stringify(cachedPack), { contentType: "application/json" }));
db.questionPacks.push({
  id: "qp_cached",
  pdf_file_id: "pdf_test123",
  r2_json_key: "question-packs/pdf_test123/pack.json",
  visibility: "public"
});
const ocrRequest = new Request("https://example.com/api/ocr-game", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pdfFileId: "pdf_test123", images: ["data:image/jpeg;base64,abc"], metadata: { grade: 3, subject: "數學" } })
});
const ocrResponse = await ocrHandler({ request: ocrRequest, env });
assert.equal(ocrResponse.status, 200);
const ocrJson = await ocrResponse.json();
assert.equal(ocrJson.mode, "cached");
assert.equal(ocrJson.title, "快取題包");

console.log("api-flow-tests-ok");
