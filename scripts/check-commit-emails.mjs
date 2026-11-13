#!/usr/bin/env node
// Commit e-mail policy (ADR-110): this repository is public, so every commit
// in the reviewed range must carry a GitHub noreply address as author and as
// committer. Fails when it finds anything else.
// Run: pnpm check:emails <base-sha> [head-sha]
// CI passes github.event.pull_request.base.sha and head.sha.
import { execFileSync } from "node:child_process";

const NOREPLY = "noreply@github.com";
const NOREPLY_SUFFIX = "@users.noreply.github.com";

const base = process.argv[2] ?? process.env.BASE_SHA;
const head = process.argv[3] ?? process.env.HEAD_SHA ?? "HEAD";

if (!base) {
  console.error("check:emails: usage: check-commit-emails.mjs <base-sha> [head-sha]");
  console.error("check:emails: or set BASE_SHA and HEAD_SHA.");
  process.exit(1);
}

const range = `${base}..${head}`;
const isAllowed = (email) => email === NOREPLY || email.endsWith(NOREPLY_SUFFIX);

let log;
try {
  log = execFileSync(
    "git",
    ["log", `--format=%H%x09%ae%x09%ce%x09%an%x09%cn`, range, "--"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch {
  console.error(`check:emails: cannot read commits in ${range}.`);
  console.error("check:emails: fetch the full history (actions/checkout with fetch-depth: 0).");
  process.exit(1);
}

const problems = [];
let checked = 0;

for (const line of log.split("\n")) {
  if (line.trim() === "") continue;
  const [sha, authorEmail, committerEmail, authorName, committerName] = line.split("\t");
  checked += 1;
  const sides = [
    ["author", authorName, authorEmail],
    ["committer", committerName, committerEmail],
  ];
  for (const [role, name, email] of sides) {
    if (!isAllowed(email)) problems.push(`${sha.slice(0, 12)} ${role} "${name}" <${email}>`);
  }
}

if (problems.length > 0) {
  console.error(`check:emails: ${problems.length} non-noreply e-mail(s) in ${range}:`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("check:emails: use a GitHub noreply address (see ADR-110).");
  process.exit(1);
}

console.log(`check:emails ok (${checked} commit(s) in ${range}, all noreply)`);
