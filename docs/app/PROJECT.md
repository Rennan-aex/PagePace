# PagePace (app): visão do produto

> **Status: RASCUNHO.** Registra tudo o que já foi decidido. O que depende de spikes está marcado **[A DEFINIR]** e é detalhado quando o extrator amadurecer (ver `ROADMAP.md`). Não implementar o app antes do marco M0 do app.

## Resumo
App de leitura para **leitura profunda** (filosofia, artigos, técnicos), que reconstrói o PDF como texto reflowable. Funcionalidades diferenciais: **leitura dinâmica por trechos com pausa**, **leitura normal com marcações e anotações**, **TTS com destaque**. O PDF nunca é exibido (exceto "ver original" na tela de correção).

## Princípio de produto
**Pausar e pensar é o centro.** A leitura dinâmica serve a quem lê textos densos: a pausa por trecho (frase/parágrafo/página) é o que mitiga a perda de compreensão das velocidades altas, e as anotações no modo normal completam o ciclo.

## Plataformas
- **Android (prioridade):** TypeScript + PWA empacotada com Capacitor. Plugins nativos onde necessário (TTS, arquivos).
- **PC:** começa como PWA/site; pode virar app local depois. **[A DEFINIR: site vs. app local]**
- Um só código TypeScript; núcleo (extrator, segmentador, motores de leitura) independente de interface.
- Desempenho no celular é prioridade: pré-processar uma vez, cache, streaming, workers, e fazer o trabalho "pesado" do nosso lado sempre que possível.

## Funcionalidades já decididas
- **Biblioteca** de livros, adicionar PDF, progresso, busca, sumário (bookmarks/títulos), fonte configurável.
- **Temas:** padrão do sistema + escolha entre **Claro** (fundo branco/texto preto), **Escuro** (cinza escuro/texto branco) e **Midnight** (fundo totalmente preto, para OLED/AMOLED).
- **Seleção manual de páginas a pular** na leitura dinâmica (título, prefácio, considerações...), nunca automática.
- **Aba central de anotações:** todas as anotações com o nome do livro; tocar abre o trecho exato com a anotação aberta. **Exportação em Markdown.**
- **Tela de correção da extração** (juntar/separar parágrafos, marcar título, "ver original").
- **Régua de foco** (destaque da linha atual) no modo normal.
- **Bionic Reading (nome evitado na UI, ex.: "Foco inicial")**: opcional, só no modo pacer e talvez no normal; **não** no palavra-por-palavra (conflita com ORP). Evidência de ganho é fraca; prioridade baixa.
- **Chunking multi-palavra:** descartado (quebra o raciocínio).
- Salvar posição ao sair; anotações e marcações salvas **imediatamente** (sobrevivem a fechamento forçado).
- Notas de rodapé: fora do fluxo da leitura dinâmica, acessíveis.
- Reflow no PC também (duas páginas reconstruídas); páginas reconstruídas podem ser reutilizadas entre modos, caso a caso.

## Fora do escopo inicial
Sincronização entre dispositivos, contas, OCR (E9 do extrator), EPUB como entrada, versão iOS.

## Documentos
`READING-MODES.md` (especificação dos 3 modos) · `ARCHITECTURE.md` · `ROADMAP.md` · `DECISIONS.md` · `OPEN-QUESTIONS.md` · `STATE.md`
