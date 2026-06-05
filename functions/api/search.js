import { error, handleOptions, json, readJson } from "../_lib/http.js";
import { searchExamBank } from "../_lib/examBank.js";
import { searchIndexedExamBank } from "../_lib/data.js";

export async function onRequest(context) {
  const options = handleOptions(context.request);
  if (options) return options;

  const url = new URL(context.request.url);
  const body = context.request.method === "POST" ? await readJson(context.request) : {};
  const query = body.query || url.searchParams.get("q") || "";
  if (!query.trim()) return error("請輸入查詢，例如：小三數學康軒上學期期中考");

  try {
    const indexed = await searchIndexedExamBank(context.env, query);
    const result = indexed?.matches?.length ? indexed : await searchExamBank(query);
    return json(result);
  } catch (err) {
    return error(err.message || "搜尋失敗", 502);
  }
}
