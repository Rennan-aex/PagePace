# Arquitetura do app (rascunho)

> **Rascunho.** Será detalhada no M0 do app, depois dos spikes.

## Camadas
```
PDF ──► @pagepace/extractor ──► Book (+ Overlay do usuário) ──► Armazenamento local
                                          │
        ┌─────────────────────────────────┼───────────────────────────┐
        ▼                                 ▼                           ▼
  Motor de leitura dinâmica        Paginador (reflow)              Motor de TTS
  (trecho + ritmo + render)        celular: subpáginas             (adaptador por plataforma)
        │                          PC: 2 páginas                          │
        └──────────────► UI (componentes) ◄──── Anotações/marcações ◄─────┘
```

## Princípios
1. **Núcleo sem UI** em TypeScript puro: extrator, segmentador, motores de leitura, paginador, âncoras. Testável sem tela.
2. **Motores de leitura plugáveis:** cada modo implementa três estratégias: *chunker* (frase/parágrafo/página), *pacer* (ritmo: WPM, pesos por tamanho/pontuação, ORP) e *renderer* (palavra por palavra, pacer-fade, contexto PC).
3. **Posição = `(blockId, wordIndex)`**; âncoras de anotação = `Anchor` do esquema (offsets + quote/prefix/suffix).
4. **Armazenamento atrás de interface:** biblioteca, `Book` em cache, overlay, posições, marcações, anotações, configurações. Implementações: IndexedDB/SQLite **[A DEFINIR]**. Salvamento imediato de anotações.
5. **Adaptadores de plataforma:** arquivos, TTS, compartilhamento. Capacitor no Android; web no PC.
6. **Paginador próprio:** gera páginas do PagePace a partir do `Book` (para o modo normal e para "Páginas" da leitura dinâmica), com referência à página original.
7. **Temas por tokens de design:** claro / escuro / midnight + preferência do sistema.
8. **Desempenho:** Web Workers para extração/paginação; renderização palavra a palavra com mínimo de reflow de layout.

## Spikes do app (M0)
S-A1 desempenho de render palavra a palavra no Android de entrada (alvo: 60 fps estáveis até ~1000 ppm) · S-A2 Capacitor + PDF.js/extração em WebView (memória) · S-A3 TTS: eventos por palavra, voz offline, Piper/Kokoro · S-A4 PWA vs app local no PC · S-A5 armazenamento (IndexedDB vs SQLite) · S-A6 paginação de reflow (subpáginas) com bom ritmo visual.
