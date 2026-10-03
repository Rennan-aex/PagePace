# Roadmap do app (macro)

| Marco | Objetivo | Depende do extrator | Critério de saída |
|---|---|---|---|
| **M0** Spikes e arquitetura | Spikes S-A1..A6; decidir PC (site vs. local), armazenamento, TTS; detalhar arquitetura e planejamento das fases | E1 | Relatórios + ADRs; planos de fase M1–M6 escritos |
| **M1** Casca do app | Projeto TS + Capacitor, biblioteca, adicionar PDF → extrair (streaming) → salvar `Book`; temas | E1–E3 | Importar um PDF N1 e ver sua lista de capítulos |
| **M2** Leitura dinâmica (celular) | Tela de preparação, palavra por palavra com ORP e ritmo proporcional, trechos frase/parágrafo/página, controles, pausa, configurações, salvar posição, pular páginas | E1–E4, SEG | Ler um livro N1 inteiro no Android com pausas por trecho; checklist manual |
| **M3** Leitura normal + anotações | Paginador, subpáginas, marca-texto/sublinhado/anotação, autosave, aba de anotações, régua de foco, tela de correção | E5, E7 | Anotar, fechar à força, reabrir sem perder nada |
| **M4** PC | Layout de 2 páginas, contexto inferior na dinâmica, atalhos, hover de anotações | M2, M3 | Paridade de funcionalidades no PC |
| **M5** TTS | Adaptador TTS, destaque da palavra, velocidade; avaliar voz local | M3 | Ler em voz alta com destaque no Android |
| **M6** Extras | OCR (E9), pacer-fade, Bionic opcional, exportação Markdown de anotações, sincronização | E9, E10 | A definir |

Cada marco será quebrado em fases e tarefas atômicas (mesmo formato do extrator) no M0.
