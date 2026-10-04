#!/usr/bin/env node
// Spike S5 (E0-T06): as fontes padrão do PDF.js são necessárias?
//
// O `pdfjs-dist` traz em `standard_fonts/` dois conjuntos: Foxit (BSD, .pfb) e
// LiberationSans (4 TTF sob GPLv2 + exceção de fonte). O worker usa Liberation
// para os 4 Helvetica base-14 não embutidos. Este script mede, lado a lado, se
// a extração e o render mudam quando `standardFontDataUrl` aponta para uma
// pasta VAZIA (ou seja, sem as fontes).
//
//   node packages/extractor/spikes/s5-fontprobe.mjs                  # PDF do corpus
//   node packages/extractor/spikes/s5-fontprobe.mjs n3-pt-filosofia2 1
//   node packages/extractor/spikes/s5-fontprobe.mjs --sintetico       # caso controlado
//
// O modo `--sintetico` monta (em `.pagepace-cache`, nunca no git) uma página
// mínima com `/BaseFont /Helvetica` sem fonte embutida — exatamente o caso em
// que o worker precisa de `LiberationSans-Regular.ttf`. Sem ele o teste num PDF
// do corpus pode sair igual por acaso (fonte embutida), não por falta do arquivo.
//
// Saída: JSON no stdout. PNGs/ PDF gerado ficam em `.pagepace-cache/spikes/S5/`.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const corpusDir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const pdfjsFonts = path.join(repoRoot, "node_modules", "pdfjs-dist", "standard_fonts");
const cacheDir = path.join(repoRoot, ".pagepace-cache", "spikes", "S5");
const emptyFonts = path.join(cacheDir, "sem-fontes");
const synthetic = process.argv.includes("--sintetico");
const pdfId = process.argv[2] ?? "n2-en-astrofisica";
const maxPages = Number(process.argv[3] ?? 5);
const toDataPath = (dir) => dir.replace(/\\/g, "/").replace(/\/+$/, "") + "/";

// PDF de 1 página, Helvetica (base-14) declarada em /Resources, SEM /FontFile.
function buildSyntheticPdf() {
  const content = "BT /F1 24 Tf 20 100 Td (Hello Helvetica) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function run(fontDir, pdfPath, pages) {
  const warnings = [];
  const task = getDocument({
    url: pdfPath,
    standardFontDataUrl: toDataPath(fontDir),
    cMapUrl: toDataPath(path.join(repoRoot, "node_modules", "pdfjs-dist", "cmaps")),
    cMapPacked: true,
    isEvalSupported: false,
    verbosity: 0,
  });
  task.onWarning = (warning) => warnings.push(String(warning));
  const doc = await task.promise;
  const totalPages = doc.numPages;
  const limit = Math.min(totalPages, pages);
  let items = 0;
  let chars = 0;
  const renders = [];
  for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    items += content.items.length;
    for (const item of content.items) chars += (item.str ?? "").length;
    const viewport = page.getViewport({ scale: 1 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    let renderError = null;
    try {
      await page.render({ canvasContext: context, viewport }).promise;
    } catch (error) {
      renderError = String(error);
    }
    renders.push({ pageNumber, png: canvas.toBuffer("image/png"), renderError });
    page.cleanup();
  }
  await task.destroy();
  return { pages: totalPages, scanned: limit, items, chars, warnings, renders };
}

async function pixels(png) {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height).data;
}

function diffPixels(a, b) {
  if (a.length !== b.length) return { identical: false, pct: 100, motivo: "tamanhos diferentes" };
  let differing = 0;
  for (let index = 0; index < a.length; index += 4) {
    if (a[index] !== b[index] || a[index + 1] !== b[index + 1] || a[index + 2] !== b[index + 2]) {
      differing++;
    }
  }
  const total = a.length / 4;
  return { identical: differing === 0, pct: Number(((differing / total) * 100).toFixed(2)) };
}

async function main() {
  await rm(emptyFonts, { recursive: true, force: true });
  await mkdir(emptyFonts, { recursive: true });
  await mkdir(cacheDir, { recursive: true });

  let pdfPath = path.join(corpusDir, `${pdfId}.pdf`);
  let label = pdfId;
  if (synthetic) {
    pdfPath = path.join(cacheDir, "helvetica-nao-embutido.pdf");
    await writeFile(pdfPath, buildSyntheticPdf());
    label = "helvetica-nao-embutido (gerado)";
  }

  const withFonts = await run(pdfjsFonts, pdfPath, maxPages);
  const withoutFonts = await run(emptyFonts, pdfPath, maxPages);

  const comparisons = [];
  for (let index = 0; index < withFonts.renders.length; index++) {
    const left = withFonts.renders[index];
    const right = withoutFonts.renders[index];
    const comparison = diffPixels(await pixels(left.png), await pixels(right.png));
    comparisons.push({
      page: left.pageNumber,
      ...comparison,
      renderErrorComFontes: left.renderError,
      renderErrorSemFontes: right.renderError,
    });
    await writeFile(path.join(cacheDir, `p${left.pageNumber}-com-fontes.png`), left.png);
    await writeFile(path.join(cacheDir, `p${left.pageNumber}-sem-fontes.png`), right.png);
  }

  console.log(
    JSON.stringify(
      {
        pdf: label,
        fontes: {
          com: { itens: withFonts.items, chars: withFonts.chars, warnings: withFonts.warnings },
          sem: { itens: withoutFonts.items, chars: withoutFonts.chars, warnings: withoutFonts.warnings },
        },
        textoIdentico:
          withFonts.items === withoutFonts.items && withFonts.chars === withoutFonts.chars,
        render: comparisons,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
