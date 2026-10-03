# Extrator PagePace: visão do projeto

## Propósito
Transformar um PDF em um **modelo intermediário** estruturado (capítulos, blocos, estilos, notas, origem) que alimenta todos os modos do app PagePace. É uma biblioteca independente, com CLI, corpus de testes e métricas, evoluída separadamente do app. O app nunca toca no PDF; só consome o esquema (`@pagepace/schema`).

## Por que é o coração do projeto
Como o app usa **reflow em todas as telas (celular e PC)**, 100% da experiência depende da qualidade da extração. PDF é formato de impressão: guarda *fonte, tamanho e posição de cada trecho de texto*, mas **não** guarda "isto é um parágrafo", "isto é um título" ou a ordem de leitura. O trabalho do extrator é reconstruir esse significado por heurística, medir a qualidade e melhorar sem regredir.

## Usuário-alvo e perfil do corpus
Leitor de **filosofia, artigos acadêmicos e livros técnicos**, em **português e inglês**. Ficção simples está fora do foco. Escaneados (Internet Archive, livros antigos) são minoria: OCR entra tarde (E9), mas a arquitetura o prevê desde o início.

Consequências de prioridade:
- **Notas de rodapé** são requisito central (em filosofia carregam parte do argumento).
- Artigos em duas colunas, referências bibliográficas, citações em bloco, epígrafes.
- Ligaduras, acentuação pt, grego/latim, numeração marginal (Bekker, Stephanus), hifenização (frequente em pt).

## Escopo
**Dentro:** extração de texto e estrutura, estilos inline, remoção de cabeçalho/rodapé, hifenização, notas, colunas, sumário, confiança por bloco, overlay de correções, streaming + cache, CLI, corpus + métricas, segmentador de frases/palavras pt/en, adaptador OCR (futuro), tabelas/equações/figuras como blocos.

**Fora (por enquanto):** UI, anotações do usuário (são do app, ancoradas ao modelo), TTS, sincronização, EPUB como entrada (EPUB só serve como gabarito), edição de PDF.

## Princípios
1. **Medir antes de heurística.** Nenhuma heurística entra sem métrica e caso de teste.
2. **Regra de ouro:** nada que piore as métricas existentes é aceito sem justificativa registrada.
3. **Contrato estável.** O esquema é versionado; o resto pode mudar à vontade.
4. **Núcleo portável** (navegador, WebView, Node) e **determinístico**.
5. **Falhar de forma visível.** Dúvida vira *confiança baixa*, que alimenta a tela de correção, em vez de erro silencioso.
6. **Pequenos passos** (GSD): tarefas atômicas, estado sempre registrado.

## Critério de sucesso do projeto
O leitor consegue abrir um livro de filosofia em pt/en do corpus e ler no app sem perceber falhas estruturais graves; metas numéricas por nível em `EVALUATION.md`.

## Documentos relacionados
`REQUIREMENTS.md` · `ARCHITECTURE.md` · `SCHEMA.md` · `ROADMAP.md` · `phases/` · `CORPUS.md` · `EVALUATION.md` · `DECISIONS.md` · `STATE.md`
