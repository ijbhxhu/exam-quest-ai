const SUBJECTS = ["國語", "數學", "自然", "社會", "英語"];
const PUBLISHERS = ["南一", "康軒", "翰林", "何嘉仁"];
const GRADE_ALIASES = [
  ["一", 1], ["二", 2], ["三", 3], ["四", 4], ["五", 5], ["六", 6],
  ["七", 7], ["八", 8], ["九", 9]
];

export function normalizeQuery(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .replace(/國文/g, "國語")
    .replace(/國小/g, "小")
    .replace(/自然科學/g, "自然")
    .replace(/期中考|第一次評量|第一次段考/g, (m) => m)
    .trim();
}

export function parseNaturalQuery(raw) {
  const query = normalizeQuery(raw);
  let grade = null;

  const digitGrade = query.match(/(?:小|國小)?([1-9])年級|小([1-9])|國([一二三])|([1-9])年級/);
  if (digitGrade) {
    const found = digitGrade.slice(1).find(Boolean);
    grade = Number(found);
  }
  if (!grade) {
    for (const [label, value] of GRADE_ALIASES) {
      if (query.includes(`小${label}`) || query.includes(`${label}年級`)) {
        grade = value;
        break;
      }
    }
  }

  const subject = SUBJECTS.find((item) => query.includes(item)) || null;
  const publisher = PUBLISHERS.find((item) => query.includes(item)) || null;
  const semester = query.includes("下") || query.includes("下學期") ? "下學期" : "上學期";

  let exam = "期中考";
  if (query.includes("期末")) exam = "期末考";
  if (query.includes("第一次")) exam = "第一次段考";
  if (query.includes("第二次")) exam = "第二次段考";
  if (query.includes("第三次")) exam = "第三次段考";

  return {
    raw,
    grade: grade || 3,
    subject,
    publisher,
    semester,
    exam
  };
}

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;/g, "-")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractLinks(cellHtml) {
  const links = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(cellHtml))) {
    links.push({ url: match[1], label: stripTags(match[2]) });
  }
  return links;
}

export async function fetchGradeRows(grade) {
  const sourceUrl = `https://melances.com/grade${grade}/`;
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "ExamQuestAI/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`無法讀取題庫頁面：${response.status}`);
  }
  const html = await response.text();
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(html))) {
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      cells.push({
        html: cellMatch[1],
        text: stripTags(cellMatch[1]),
        links: extractLinks(cellMatch[1])
      });
    }
    if (cells.length >= 5 && cells[4].links.length) {
      rows.push({
        subject: cells[0].text,
        publisher: cells[1].text,
        semester: cells[2].text,
        examSet: cells[3].text,
        links: cells.slice(4).flatMap((cell) => cell.links),
        sourceUrl
      });
    }
  }
  return rows;
}

export async function searchExamBank(rawQuery) {
  const intent = parseNaturalQuery(rawQuery);
  const missing = [];
  if (!intent.subject) missing.push("科目");
  if (!intent.publisher) missing.push("版本");

  const rows = await fetchGradeRows(intent.grade);
  const matches = rows
    .filter((row) => !intent.subject || row.subject.includes(intent.subject))
    .filter((row) => !intent.publisher || row.publisher.includes(intent.publisher))
    .filter((row) => row.semester.includes(intent.semester))
    .map((row) => {
      const target = row.links.find((link) => link.label.includes(intent.exam));
      return target ? { ...row, target } : null;
    })
    .filter(Boolean);

  return {
    intent,
    missing,
    matches: matches.map((row) => ({
      grade: intent.grade,
      subject: row.subject,
      publisher: row.publisher,
      semester: row.semester,
      examSet: row.examSet,
      exam: row.target.label,
      folderUrl: row.target.url,
      sourceUrl: row.sourceUrl
    }))
  };
}

export function parseDriveFileId(url) {
  const folder = String(url || "").match(/folders\/([A-Za-z0-9_-]+)/);
  const file = String(url || "").match(/\/d\/([A-Za-z0-9_-]+)/);
  return folder?.[1] || file?.[1] || null;
}

export async function listDrivePdfs(folderUrl) {
  const folderId = parseDriveFileId(folderUrl);
  if (!folderId) {
    throw new Error("Google Drive folder URL 無效");
  }
  const response = await fetch(`https://drive.google.com/drive/folders/${folderId}?usp=sharing`, {
    headers: {
      "User-Agent": "ExamQuestAI/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`無法讀取 Drive 資料夾：${response.status}`);
  }
  const html = (await response.text()).replace(/&quot;/g, "\"");
  const re = /\[\[null,"([A-Za-z0-9_-]{20,})"\][\s\S]{0,5000}?\[\[\["([^"]+?\.pdf(?:\.pdf)?)"/g;
  const seen = new Set();
  const files = [];
  let match;
  while ((match = re.exec(html))) {
    const id = match[1];
    const name = match[2].replace(/\.pdf\.pdf$/i, ".pdf");
    const key = `${id}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push({
      id,
      name,
      kind: name.includes("答案") ? "答案" : "試卷",
      previewUrl: `https://drive.google.com/file/d/${id}/view`,
      downloadUrl: `https://drive.usercontent.google.com/download?id=${id}&export=download&authuser=0`,
      proxyUrl: `/api/pdf?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`
    });
  }

  files.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "試卷" ? -1 : 1;
    return b.name.localeCompare(a.name, "zh-Hant");
  });
  return { folderId, files };
}
