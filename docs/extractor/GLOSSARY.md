# Glossário

- **Bloco:** unidade estrutural do modelo (parágrafo, título, citação...).
- **Run:** trecho de texto de um bloco com estilo uniforme.
- **Reflow:** reconstruir o texto para o tamanho de tela, em vez de mostrar a página fixa do PDF.
- **Tagged PDF:** PDF com árvore de estrutura (parágrafos/títulos explícitos). Raro e de qualidade variável.
- **Overlay:** correções do usuário guardadas à parte do modelo.
- **Âncora:** referência a um trecho (blockId + offsets + citação) que sobrevive a reprocessamentos.
- **Golden:** gabarito esperado usado em testes.
- **Baseline:** resultado de métricas aceito, contra o qual PRs são comparados.
- **ORP:** ponto ótimo de reconhecimento da palavra (letra-âncora fixa na tela) no modo palavra por palavra.
- **RSVP:** apresentação rápida e serial de palavras, uma por vez.
- **Pacer:** modo em que o texto fica na tela e só a palavra atual está visível/destacada.
- **Trecho:** unidade de leitura dinâmica entre pausas: frase, parágrafo ou página (nossa, reconstruída).
