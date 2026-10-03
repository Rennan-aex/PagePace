# Especificação dos modos de leitura (rascunho consolidado)

Fonte: decisões do PO. **[A DEFINIR]** marca pontos dependentes de spike. Todos os modos leem do `Book`; posição de leitura = `(blockId, wordIndex)`.

## 1. Leitura dinâmica (paced)

### Tela de preparação (antes de abrir o modo)
- **Tamanho do trecho:** 3 botões: **Frases**, **Parágrafos** (padrão), **Páginas**.
  - Frases: para ao fim da frase (segmentador pt/en, não pelo ponto simples). Recomendado para livros complexos.
  - Parágrafos: para ao fim do bloco (vem da **estrutura**, não da pontuação). Meio-termo.
  - Páginas: para no fim da **página do PagePace** (reconstruída por nós, ver abaixo). Recomendado para textos leves.
- **Velocidade (palavras por minuto):** campo editável, padrão **400**; ajusta dinamicamente.
- **Modo de apresentação:** *palavra por palavra* (padrão) ou *pacer* (texto na tela, só a palavra atual visível/destacada; as anteriores se apagam rápido, no máximo 3–4 visíveis).
- **Páginas a pular:** seleção manual (título, prefácio, considerações etc.).
- **Régua/contexto** conforme plataforma (abaixo).

### Tela de leitura
- Abre pausada **na primeira palavra** do ponto de início.
- **Botões de ação:**
  - **Play:** inicia, continua de onde pausou, e avança para o próximo trecho quando o atual terminou. Cor diferente para *começar/continuar* e para *passar ao próximo trecho*.
  - **Pausar:** pausa na palavra atual.
  - **Voltar / Avançar** 1 ou mais palavras a partir da palavra pausada.
  - **Recomeçar** o trecho (ao pausar ou ao terminar).
  - **Pular** para o início do próximo trecho.
- **Enquanto lê:** todo o menu some; ficam só as palavras e o botão de pausar. A tela de pausa **não cobre o texto**: apenas mostra os demais botões e, no canto superior, o botão de **configurações** (tamanho do trecho, velocidade, modo de apresentação, contexto inferior, régua, etc.).
- **Fim do trecho:** o programa pausa e espera o leitor (próximo trecho ou recomeçar).

### Ritmo
- Tempo **proporcional**: palavras longas e pontuação demoram mais (configurável). Pontuação colada fica **junto da palavra** (`"tempo,"`).
- **ORP:** letra-âncora fixa na mesma posição da tela no modo palavra por palavra. Decisão: ORP tem prioridade sobre Bionic nesse modo.
- Parâmetros iniciais **[A DEFINIR com testes de uso]**: acréscimo por caractere acima de N letras; multiplicadores para vírgula/ponto/parágrafo.

### PC: contexto abaixo
No palavra-por-palavra no PC: palavra atual na **metade superior**; na **metade inferior** o texto inteiro, menor, mostrando onde o leitor está. Não lidas: levemente apagadas; atual: cor de destaque; já lidas: cor padrão. A área responde a voltar/recomeçar (as palavras após a nova atual voltam a apagar). Desligável nas configurações. **Clicar numa palavra leva a leitura até ela.**

### Páginas do PagePace
"Página" na leitura dinâmica = página **reconstruída por nós**, definida pelo nosso paginador (não a página do PDF). A página original fica como referência de localização.

### Posição ao sair
Salva o **trecho** em que estava. Ao voltar, **recomeça no início do trecho** (padrão, para recontextualizar). Opção nas configurações: retomar da **palavra exata**.

### Conteúdo não textual
No dinâmico: **pula** imagens, tabelas, equações e notas de rodapé (acessíveis no modo normal / painel de notas).

## 2. Leitura normal
- Páginas reconstruídas: **PC: 2 páginas** lado a lado (configurável para 1; avançar mostra as 2 seguintes). **Celular:** a página é quebrada em **subpáginas** (ex.: 3 parágrafos → 3 subpáginas); o indicador mostra **subpágina e página** (a página original dá noção de posição em livros de ~500 páginas). Páginas curtas dinâmicas podem ser usadas também para tabelas/figuras.
- Navegação: avançar/voltar página.
- **Seleção** com a ferramenta padrão do dispositivo, com ações: **marca-texto** (cor escolhida), **sublinhar**, **anotar**.
- **Anotações:** trecho anotado fica destacado de forma especial; **toque (celular) / passar o mouse (PC)** abre a anotação. Salvas **assim que escritas**. Acessíveis também pela aba central de anotações.
- **Ao sair:** salva página/subpágina, marcações e anotações; ao voltar, mesma posição.
- Régua de foco opcional; Bionic opcional **[baixa prioridade]**.

## 3. Text to speech
- Mesma aparência do modo normal + **os botões de ação da leitura dinâmica** (Play, Pausar, Voltar/Avançar, Recomeçar, Pular).
- **Play** inicia a leitura em voz alta; a **palavra falada** aparece em cor de destaque.
- Único botão extra: **velocidade** (fácil acesso).
- Usa o TTS do dispositivo por padrão. **[A DEFINIR]**: TTS local neural leve (Piper com vozes pt-BR, Kokoro) para qualidade melhor offline; destaque palavra a palavra depende de eventos de progresso do motor (confiável no Android/iOS nativos, irregular na Web Speech API). Fallback: destacar a frase. No Android, "pausar" é "parar e retomar da palavra".
