# E9 · Adaptador OCR

**Requisitos:** REQ-EXT-20. **Depende de:** E1 (formato bruto) e pipeline estável (E2–E7). **Saída:** PDFs N5 abrem e ficam legíveis, com confiança calibrada.

## Tarefas
### E9-T01 · Spike: opções de OCR · `done`
- Comparar tesseract.js (WASM, Apache-2.0), OCR nativo do Android (ML Kit, via plugin), serviços locais. Medir qualidade em pt e en (livros antigos), tempo e tamanho. **Aceite:** `spikes/S7-ocr.md` com recomendação. (O nome S6-ocr.md do planejamento virou **S7**: o S6 já foi consumido pelo spike de fonte quebrada; ADR-093.)
- **Resultado (2026-10-30):** **`done` — relatório `docs/extractor/spikes/S7-ocr.md` + probe `packages/extractor/spikes/s7-ocr-probe.ts` + ADR-093 (devDependency tesseract.js) e ADR-094 (recomendação).** Medido em páginas reais: CER 1–2% contra transcrição humana (pt n5 e en antigo n5) e 0,25–0,8% contra a camada OCR embutida do lostworld; WASM e nativo com qualidade praticamente idêntica (mesmo motor/modelo); WASM 1,5–2,9 s/página no PC, nativo 0,8–1,9; modelo `best_int` ≈ `std` em qualidade com 1/4 do tamanho; payload do app ~10–12 MB na primeira carga. **Recomendação (ADR-094): tesseract.js** (mesmos bytes no app/PC/CI, Apache-2.0) como engine da E9-T02; Tesseract nativo só como CLI de conferência; **ML Kit** fica como acelerador Android opcional (licença Google não-OSI, +4 MB ou Play Services, qualidade não medida — reabre só com medição em aparelho e decisão do PO). **Achado de pipeline:** páginas JBIG2/JPX (lostworld/filosofia) renderizam em branco no pdf.js sem `wasmUrl` — com o assets wasm (receita S1/ADR-020) decodificam; a E9-T02 liga `render` → engine. **Armadilhas do probe:** `@` no PowerShell exige aspas nos nomes de pacote; render por escala sobrescreve o PNG (`id-pN.png`); scans com páginas em branco de verdade (n5-pt) confundem amostragem — medir densidade de bytes do PNG.
### E9-T02 · Adaptador → `RawDocument`
- Produz itens com bbox e texto, `ingest.adapter = "ocr"`, sem estilo. **Aceite:** valida no esquema; pipeline roda inalterado.
### E9-T03 · Estilo a partir da imagem
- Heurística visual para itálico/negrito/tamanho de fonte (altura de x, espessura de traço), opcional; cair para "sem estilo" com baixa confiança. **Aceite:** `style_f1` medido separadamente para N5.
### E9-T04 · Pré-processamento e fluxo de uso
- Detectar escaneado → perguntar ao usuário (app) → processar em segundo plano com progresso. **Aceite:** teste do detector; documentação do fluxo para `docs/app`.
