// Spike BACKLOG-26 part 5: locate the inspect quote "F (d) ? F (R)" and dump
// every lone-"?" context in both n4 PDFs.
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const dir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";

async function scan(file: string): Promise<void> {
  const bytes = new Uint8Array(readFileSync(path.join(dir, file)));
  const task = getDocument({ data: bytes, fontExtraProperties: true, verbosity: 0 });
  const pdf = await task.promise;
  const meta = (await pdf.getMetadata().catch(() => null)) as { info?: Record<string, unknown> } | null;
  console.log(`\n===== ${file} pages=${pdf.numPages} producer=${meta?.info?.Producer ?? "?"} =====`);
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as Array<{ str: string }>).map((i) => i.str);
    const joined = items.join(" ");
    // The inspect quote, spacing-insensitive.
    if (/F\s*\(\s*d\s*\)\s*\?\s*F\s*\(\s*R\s*\)/.test(joined)) {
      const at = joined.search(/F\s*\(\s*d\s*\)/);
      console.log(`p${p} QUOTE: ${JSON.stringify(joined.slice(Math.max(0, at - 60), at + 80))}`);
    }
    // Any "?" adjacent to an F-token (formula shapes).
    if (/\?\s*F\s*\(/.test(joined) || /F\s*\([^)]*\)\s*\?/.test(joined)) {
      const at = joined.search(/\?\s*F\s*\(|F\s*\([^)]*\)\s*\?/);
      if (!/F\s*\(\s*d\s*\)\s*\?\s*F/.test(joined)) {
        console.log(`p${p} F..?: ${JSON.stringify(joined.slice(Math.max(0, at - 40), at + 60))}`);
      }
    }
    page.cleanup();
  }
  await task.destroy();
}

await scan("n4-pt-astrofisica.pdf");
await scan("n4-en-astrofisica.pdf");
