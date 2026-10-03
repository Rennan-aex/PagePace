# Requisitos do extrator

Prioridade: **P0** essencial para o app funcionar · **P1** importante · **P2** desejável. A coluna "Fase" diz onde o requisito é atendido pela primeira vez.

| ID | Requisito | Pri | Fase |
|---|---|---|---|
| REQ-EXT-01 | Extrair o texto completo sem perda relevante (CER dentro da meta por nível) | P0 | E1–E2 |
| REQ-EXT-02 | Produzir ordem de leitura correta | P0 | E2, E6 |
| REQ-EXT-03 | Agrupar linhas em parágrafos (blocos) | P0 | E2 |
| REQ-EXT-04 | Detectar títulos com nível e gerar sumário (bookmarks do PDF + fallback por títulos) | P0 | E4 |
| REQ-EXT-05 | Preservar estilos inline: negrito, itálico, sobrescrito/subscrito | P0 | E4 |
| REQ-EXT-06 | Remover cabeçalhos, rodapés e números de página repetidos (guardando a numeração original como metadado) | P0 | E3 |
| REQ-EXT-07 | Resolver hifenização de fim de linha e unir palavras/parágrafos que cruzam a página | P0 | E3 |
| REQ-EXT-08 | Detectar notas de rodapé/fim e ligá-las ao ponto de chamada | P0 | E5 |
| REQ-EXT-09 | Detectar citações em bloco, epígrafes, listas, referências bibliográficas e legendas | P1 | E5 |
| REQ-EXT-10 | Tratar layout em colunas | P0 | E6 |
| REQ-EXT-11 | Representar tabelas, equações e figuras como blocos (não somem, não poluem o fluxo) | P1 | E10 |
| REQ-EXT-12 | Cada bloco guarda origem: página(s) e bbox no PDF | P0 | E1 |
| REQ-EXT-13 | Cada bloco tem confiança (0–1) e motivos | P0 | E7 |
| REQ-EXT-14 | Formato de overlay de correções do usuário, reaplicável após reprocessar | P0 | E7 |
| REQ-EXT-15 | Processamento por página em streaming + cache por (hash do PDF, versão do extrator) | P0 | E8 |
| REQ-EXT-16 | Determinismo: mesma entrada, mesma saída | P0 | E1 |
| REQ-EXT-17 | Núcleo roda em Node, navegador e WebView; sem `fs` no núcleo | P0 | E1 |
| REQ-EXT-18 | Suporte a pt e en; unicode correto (ligaduras, acentos, grego, latim) | P0 | E3 |
| REQ-EXT-19 | Numeração marginal clássica (Bekker, Stephanus) reconhecida e separada do texto | P2 | E5 |
| REQ-EXT-20 | Adaptador OCR produzindo o mesmo formato bruto da ingestão | P1 | E9 |
| REQ-EXT-21 | Dependências com licença compatível (sem AGPL/GPL) | P0 | contínuo |
| REQ-EXT-22 | Detectar PDF escaneado/sem texto e avisar (sem tentar extrair lixo) | P1 | E1 |
| REQ-SEG-01 | Segmentar frases em pt/en com lista de abreviações, tratando `?`, `!`, reticências, diálogos | P0 | SEG |
| REQ-SEG-02 | Tokenizar palavras mantendo pontuação anexada (`"tempo,"`) | P0 | SEG |
| REQ-SEG-03 | Segmentador puro e determinístico, usável por extrator, app e TTS | P0 | SEG |
