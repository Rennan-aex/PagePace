# Perguntas em aberto (para o PO)

Regra: se uma decisão muda o rumo do produto, a IA registra aqui, marca a tarefa como `blocked` e para. O PO responde e a resposta vira ADR.

## Abertas
2. **Fontes de PDFs públicos** para o corpus N3 em pt: levantar candidatos de domínio público com PDF digital (tarefa E0-T01b). **Atualização (2026-10-04):** também falta um PDF **digital de filosofia em inglês** para o N3 — o único N3-en hoje (`n3-en-filosofia`) é scan com OCR embutido (ver CORPUS.md).

## Respondidas
1. **Figuras no modo de leitura normal:** mostrar um recorte de imagem da figura (renderizado do PDF) conta como exceção à regra "nunca mostrar o PDF"? **Resposta do PO (2026-10-04):** opção A — recorte de imagem só de figuras/tabelas/equações complexas, só no modo de leitura normal; na leitura dinâmica são pulados. Registrado em ADR-016 (exceção à ADR-003).
3. **Lint/format:** ESLint+Prettier ou Biome? **Resposta do PO (2026-10-04):** Biome, com ADR provisória — confirmar licença e funcionamento na E1-T00. Registrado em ADR-017.
4. **Campo de arquivo local no manifest privado:** o manifest público localiza o PDF por `source_url`; o privado precisa do nome do arquivo dentro de `$CORPUS_PRIVATE_DIR`. A IA usou `file:` em `$CORPUS_PRIVATE_DIR/manifest.yaml` (13 entradas) e um `title` provisório, tirado do nome do arquivo. Alternativas: `file`, `path`, `local_path` ou reutilizar `source_url` com caminho relativo. Definir na E1-T05 (o runner mescla os dois manifests). Não bloqueia a E0-T01: só o campo precisa de nome definitivo. **Resposta do PO (2026-10-03):** usar `file:`, com o nome do arquivo relativo a `CORPUS_PRIVATE_DIR`. Registrado em ADR-014.
5. **PDFs escaneados (sem camada de texto):** o spike S1 achou `n5-pt-astrofisica.pdf` com 319 páginas e **zero** texto (só imagem). Não é defeito do PDF.js: não existe texto para ler. O que o PagePace faz com livro escaneado — (a) recusar com mensagem clara, (b) aceitar e pedir OCR depois, (c) outro? **Resposta do PO (2026-10-04):** opção B — o extrator detecta, avisa `PDF escaneado: leitura exige OCR, ainda não disponível` e não tenta extrair; o app guarda o livro na biblioteca marcado como "aguardando OCR". Registrado em ADR-018; E1-T03 ajustada.
