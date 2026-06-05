#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { fetchGradeRows, listDrivePdfs, parseDriveFileId } from "../functions/_lib/examBank.js";

const DEFAULT_GRADES = [1, 2, 3, 4, 5, 6];
const OUT_DIR = "data";
const MANIFEST_PATH = join(OUT_DIR, "pdf-manifest.json");
const DOWNLOAD_DIR = join("mirror", "pdf");

function arg(name, fallback = "") {
  const flag = `--${name}=`;
  return process.argv.find((item) => item.startsWith(flag))?.slice(flag.length) || fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function stableId(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function r2KeyFor(file) {
  const publisher = encodeURIComponent(file.publisher);
  const subject = encodeURIComponent(file.subject);
  const semester = encodeURIComponent(file.semester);
  const exam = encodeURIComponent(file.examType);
  return `pdf/grade-${file.grade}/${publisher}/${subject}/${semester}/${exam}/${file.driveFileId}.pdf`;
}

async function mapLimit(items, limit, fn, progressLabel) {
  const out = [];
  let index = 0;
  let active = 0;
  let done = 0;
  return await new Promise((resolve) => {
    const next = () => {
      while (active < limit && index < items.length) {
        const current = index++;
        active += 1;
        fn(items[current], current).then(
          (value) => { out[current] = value; },
          (error) => { out[current] = { error: error.message }; }
        ).finally(() => {
          active -= 1;
          done += 1;
          if (progressLabel && (done % 100 === 0 || done === items.length)) {
            console.error(`${progressLabel} ${done}/${items.length}`);
          }
          if (done === items.length) resolve(out);
          else next();
        });
      }
    };
    next();
  });
}

async function scan() {
  const grades = arg("grades")
    ? arg("grades").split(",").map(Number).filter(Boolean)
    : DEFAULT_GRADES;
  const folders = [];
  for (const grade of grades) {
    const rows = await fetchGradeRows(grade);
    for (const row of rows) {
      for (const link of row.links || []) {
        if (!/drive\.google\.com/.test(link.url)) continue;
        folders.push({ grade, row, link });
      }
    }
  }

  const folderResults = await mapLimit(folders, Number(arg("concurrency", "12")), async ({ grade, row, link }) => {
    const result = await listDrivePdfs(link.url);
    const folderId = parseDriveFileId(link.url);
    return {
      folderId,
      grade,
      subject: row.subject,
      publisher: row.publisher,
      semester: row.semester,
      examSet: row.examSet,
      examType: link.label,
      folderUrl: link.url,
      sourceUrl: row.sourceUrl,
      files: result.files || []
    };
  }, "folders");

  const unique = new Map();
  const folderRecords = [];
  for (const folder of folderResults) {
    if (!folder || folder.error) continue;
    folderRecords.push({ ...folder, files: undefined, fileCount: folder.files.length });
    for (const file of folder.files) {
      const key = file.id;
      if (unique.has(key)) continue;
      const record = {
        id: `pdf_${stableId(file.id)}`,
        driveFileId: file.id,
        folderId: folder.folderId,
        filename: file.name,
        kind: file.kind === "答案" ? "answer" : "exam",
        grade: folder.grade,
        subject: folder.subject,
        publisher: folder.publisher,
        semester: folder.semester,
        examSet: folder.examSet,
        examType: folder.examType,
        sourceUrl: folder.folderUrl,
        previewUrl: file.previewUrl,
        downloadUrl: file.downloadUrl,
        r2Key: r2KeyFor({
          driveFileId: file.id,
          grade: folder.grade,
          subject: folder.subject,
          publisher: folder.publisher,
          semester: folder.semester,
          examType: folder.examType
        }),
        sizeBytes: null,
        sha256: null,
        mirrorStatus: "pending"
      };
      unique.set(key, record);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "https://melances.com/test-bank/",
    folders: folderRecords,
    files: [...unique.values()]
  };
  ensureDir(OUT_DIR);
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${MANIFEST_PATH}`);
  console.log(`folders=${manifest.folders.length} pdfs=${manifest.files.length}`);
}

async function audit() {
  const manifest = JSON.parse(readFileSync(arg("manifest", MANIFEST_PATH), "utf8"));
  const files = manifest.files || [];
  const audited = await mapLimit(files, Number(arg("concurrency", "32")), async (file) => {
    const response = await fetch(file.downloadUrl, {
      method: "HEAD",
      headers: { "User-Agent": "ExamQuestAI/1.0" }
    });
    return {
      ...file,
      sizeBytes: Number(response.headers.get("content-length") || 0) || file.sizeBytes || null,
      contentType: response.headers.get("content-type") || null,
      auditStatus: response.status
    };
  }, "headers");
  manifest.files = audited.map((file) => file.error ? file : file);
  manifest.auditedAt = new Date().toISOString();
  ensureDir(dirname(arg("out", MANIFEST_PATH)));
  writeFileSync(arg("out", MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);

  const measured = manifest.files.filter((file) => file.sizeBytes);
  const total = measured.reduce((sum, file) => sum + file.sizeBytes, 0);
  console.log(`measured=${measured.length}/${manifest.files.length}`);
  console.log(`totalGiB=${(total / 1024 / 1024 / 1024).toFixed(2)}`);
}

async function download() {
  const manifest = JSON.parse(readFileSync(arg("manifest", MANIFEST_PATH), "utf8"));
  const limit = Number(arg("limit", "0"));
  const files = (manifest.files || []).filter((file) => file.downloadUrl).slice(0, limit || undefined);
  await mapLimit(files, Number(arg("concurrency", "4")), async (file) => {
    const localPath = join(DOWNLOAD_DIR, file.r2Key);
    if (existsSync(localPath) && !hasFlag("force")) return { ...file, localPath };
    ensureDir(dirname(localPath));
    const response = await fetch(file.downloadUrl, {
      headers: { "User-Agent": "ExamQuestAI/1.0" }
    });
    if (!response.ok || !response.body) throw new Error(`download failed ${response.status}: ${file.filename}`);
    const hash = createHash("sha256");
    const tap = new TransformStream({
      transform(chunk, controller) {
        hash.update(chunk);
        controller.enqueue(chunk);
      }
    });
    await pipeline(response.body.pipeThrough(tap), createWriteStream(localPath));
    file.localPath = localPath;
    file.sha256 = hash.digest("hex");
    file.sizeBytes = file.sizeBytes || Number(response.headers.get("content-length") || 0) || null;
    return file;
  }, "downloads");
  writeFileSync(arg("out", MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
}

function upload() {
  const bucket = arg("bucket");
  if (!bucket) throw new Error("missing --bucket=<r2-bucket-name>");
  const manifest = JSON.parse(readFileSync(arg("manifest", MANIFEST_PATH), "utf8"));
  const limit = Number(arg("limit", "0"));
  const files = (manifest.files || []).filter((file) => file.localPath || existsSync(join(DOWNLOAD_DIR, file.r2Key))).slice(0, limit || undefined);
  for (const file of files) {
    const localPath = file.localPath || join(DOWNLOAD_DIR, file.r2Key);
    const result = spawnSync("npx", ["wrangler", "r2", "object", "put", `${bucket}/${file.r2Key}`, "--file", localPath], {
      stdio: "inherit"
    });
    if (result.status !== 0) throw new Error(`upload failed: ${file.r2Key}`);
    file.mirrorStatus = "mirrored";
  }
  writeFileSync(arg("out", MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
}

const command = process.argv[2];
if (command === "scan") await scan();
else if (command === "audit") await audit();
else if (command === "download") await download();
else if (command === "upload") upload();
else {
  console.log([
    "Usage:",
    "  npm run mirror:scan -- --grades=3,4",
    "  npm run mirror:audit",
    "  npm run mirror:download -- --limit=20",
    "  npm run mirror:upload -- --bucket=exam-quest-pdfs --limit=20"
  ].join("\n"));
}
