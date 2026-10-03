# E9 · Adaptador OCR

**Requisitos:** REQ-EXT-20. **Depende de:** E1 (formato bruto) e pipeline estável (E2–E7). **Saída:** PDFs N5 abrem e ficam legíveis, com confiança calibrada.

## Tarefas
### E9-T01 · Spike: opções de OCR
- Comparar tesseract.js (WASM, Apache-2.0), OCR nativo do Android (ML Kit, via plugin), serviços locais. Medir qualidade em pt e en (livros antigos), tempo e tamanho. **Aceite:** `spikes/S6-ocr.md` com recomendação.
### E9-T02 · Adaptador → `RawDocument`
- Produz itens com bbox e texto, `ingest.adapter = "ocr"`, sem estilo. **Aceite:** valida no esquema; pipeline roda inalterado.
### E9-T03 · Estilo a partir da imagem
- Heurística visual para itálico/negrito/tamanho de fonte (altura de x, espessura de traço), opcional; cair para "sem estilo" com baixa confiança. **Aceite:** `style_f1` medido separadamente para N5.
### E9-T04 · Pré-processamento e fluxo de uso
- Detectar escaneado → perguntar ao usuário (app) → processar em segundo plano com progresso. **Aceite:** teste do detector; documentação do fluxo para `docs/app`.
