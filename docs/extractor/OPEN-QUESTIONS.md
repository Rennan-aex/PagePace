# Perguntas em aberto (para o PO)

Regra: se uma decisão muda o rumo do produto, a IA registra aqui, marca a tarefa como `blocked` e para. O PO responde e a resposta vira ADR.

## Abertas
2. **Fontes de PDFs públicos** para o corpus N3 em pt: levantar candidatos de domínio público com PDF digital (tarefa E0-T01b). **Atualização (2026-10-04):** também falta um PDF **digital de filosofia em inglês** para o N3 — o único N3-en hoje (`n3-en-filosofia`) é scan com OCR embutido (ver CORPUS.md).
3. **Orçamento de 300 MB (ARCHITECTURE decisão 8) vs metodologia oficial (ADR-091, 2026-10-29):** o `pnpm bench` mede o RSS natural do processo Node (inclui ~290 MB de piso dos módulos) e o `n1-pt-sofia` sai em ~530–625 MB — as medições antigas de ~300 MB (ADR-090) usavam outro método e não são comparáveis. A pergunta para o PO, ao fechar a E8: **o orçamento de 300 MB passa a valer para o que o aparelho mede no Android (condição c da ADR-005, via adb), ou o número do bench vira a nova linha de base do orçamento no PC?** Não bloqueia a E8-T04 — os números e o gate já funcionam; afeta só contra o que a fase E8 é avaliada.

## Respondidas
Movidas em 2026-10-11 (DOCS-T01) para `docs/extractor/archive/OPEN-QUESTIONS-ANSWERED.md` (nada foi apagado).
