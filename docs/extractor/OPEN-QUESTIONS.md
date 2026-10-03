# Perguntas em aberto (para o PO)

Regra: se uma decisão muda o rumo do produto, a IA registra aqui, marca a tarefa como `blocked` e para. O PO responde e a resposta vira ADR.

## Abertas
1. **Figuras no modo de leitura normal:** mostrar um recorte de imagem da figura (renderizado do PDF) conta como exceção à regra "nunca mostrar o PDF"? Sugestão: sim, recorte só de figuras/tabelas/equações complexas. Decidir antes do E10.
2. **Fontes de PDFs públicos** para o corpus N3 em pt: levantar candidatos de domínio público com PDF digital (tarefa E0-T01).
3. **Lint/format:** ESLint+Prettier ou Biome? (E1-T00)
4. **Campo de arquivo local no manifest privado:** o manifest público localiza o PDF por `source_url`; o privado precisa do nome do arquivo dentro de `$CORPUS_PRIVATE_DIR`. A IA usou `file:` em `$CORPUS_PRIVATE_DIR/manifest.yaml` (13 entradas) e um `title` provisório, tirado do nome do arquivo. Alternativas: `file`, `path`, `local_path` ou reutilizar `source_url` com caminho relativo. Definir na E1-T05 (o runner mescla os dois manifests). Não bloqueia a E0-T01: só o campo precisa de nome definitivo.

## Respondidas
(vazio)
