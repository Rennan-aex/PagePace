# Decisões do app

## Tomadas
| # | Decisão |
|---|---|
| A-001 | Nome: **PagePace** (verificar disponibilidade em Play Store/domínio/marca antes do lançamento) |
| A-002 | Stack: TypeScript, PWA + Capacitor (Android); núcleo independente de UI |
| A-003 | Reflow em todas as telas; PDF nunca exibido (exceto "ver original" na correção) |
| A-004 | Leitura dinâmica: trechos frase/parágrafo/página; padrão parágrafo; 400 ppm; pausa ao fim do trecho |
| A-005 | Fim de parágrafo vem da estrutura; fim de frase do segmentador; "página" é a do PagePace |
| A-006 | Ritmo proporcional ao tamanho da palavra e à pontuação; pontuação junto da palavra |
| A-007 | ORP no palavra-por-palavra; Bionic só no pacer/normal e opcional |
| A-008 | Chunking multi-palavra descartado |
| A-009 | Ao voltar: recomeça o trecho (padrão); palavra exata é opção |
| A-010 | Temas: sistema, claro, escuro, midnight |
| A-011 | Aba de anotações com navegação ao trecho; exportação em Markdown |
| A-012 | PC com 2 páginas reconstruídas (configurável para 1); celular com subpáginas e indicador página/subpágina |
| A-013 | TTS padrão do dispositivo; TTS local neural a investigar |
| A-014 | Anotações/marcações salvas imediatamente |
| A-015 | Modo dinâmico pula não textual e notas; acessíveis no modo normal |

## A decidir
Ver `OPEN-QUESTIONS.md`.
