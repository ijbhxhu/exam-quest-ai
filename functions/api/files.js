import { error, handleOptions, json, readJson } from "../_lib/http.js";
import { listDrivePdfs } from "../_lib/examBank.js";
import { listIndexedPdfs } from "../_lib/data.js";

export async function onRequest(context) {
  const options = handleOptions(context.request);
  if (options) return options;

  const url = new URL(context.request.url);
  const body = context.request.method === "POST" ? await readJson(context.request) : {};
  const folderUrl = body.folderUrl || url.searchParams.get("folderUrl") || "";
  const folderId = body.folderId || url.searchParams.get("folderId") || "";
  if (!folderUrl && !folderId) return error("缺少 folderUrl 或 folderId");

  try {
    const indexed = await listIndexedPdfs(context.env, { folderId, folderUrl });
    const result = indexed?.files?.length ? indexed : await listDrivePdfs(folderUrl);
    return json(result);
  } catch (err) {
    return error(err.message || "讀取 PDF 清單失敗", 502);
  }
}
