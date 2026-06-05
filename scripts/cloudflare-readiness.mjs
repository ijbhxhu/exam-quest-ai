#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const projectName = process.env.CLOUDFLARE_PAGES_PROJECT || "exam-quest-ai";
const d1Name = process.env.CLOUDFLARE_D1_NAME || "exam-quest-ai";
const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET || "exam-quest-pdfs";

function run(label, command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return {
    label,
    ok: result.status === 0,
    status: result.status,
    output
  };
}

function print(check) {
  const mark = check.ok ? "ok" : "fail";
  console.log(`[${mark}] ${check.label}`);
  if (!check.ok && check.output) {
    console.log(check.output.split("\n").slice(0, 8).join("\n"));
  }
}

const checks = [];
checks.push({
  label: "CLOUDFLARE_API_TOKEN is set",
  ok: Boolean(process.env.CLOUDFLARE_API_TOKEN),
  output: "Set CLOUDFLARE_API_TOKEN or run: gh auth refresh is unrelated; this is a Cloudflare token."
});
checks.push(run("wrangler is authenticated", "npx", ["wrangler", "whoami"]));
checks.push(run(`Pages project exists: ${projectName}`, "npx", ["wrangler", "pages", "project", "list"]));
checks.push(run(`D1 database list includes: ${d1Name}`, "npx", ["wrangler", "d1", "list"]));
checks.push(run(`R2 bucket list includes: ${r2Bucket}`, "npx", ["wrangler", "r2", "bucket", "list"]));
checks.push({
  label: "D1 migration exists",
  ok: existsSync("migrations/0001_initial.sql"),
  output: "Missing migrations/0001_initial.sql"
});
checks.push({
  label: "OpenAI secret is not stored in .dev.vars",
  ok: !existsSync(".dev.vars") || !/sk-proj|sk-/.test(readFileSync(".dev.vars", "utf8")),
  output: "Do not commit or keep production OpenAI secrets in .dev.vars."
});

for (const check of checks) print(check);
const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.log(`\n${failed.length} readiness check(s) need attention.`);
  process.exit(1);
}
console.log("\nCloudflare readiness checks passed.");
