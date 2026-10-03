# Checklist manual: conferência visual da extração

Executar ao fim de cada fase do extrator (E2–E8) com `pagepace inspect <pdf>` (relatório lado a lado: página original × blocos extraídos, com flags de confiança). Use 1 livro N1, 1 artigo N2 e 1 livro de filosofia N3 (pelo menos um em pt e um em en).

Data: ____ · Fase: ____ · Commit: ____ · Quem: ____

## Por documento (5 páginas escolhidas: início, meio, fim, uma com nota/citação, uma difícil)
- [ ] Todo o texto da página aparece (nada perdido, nada duplicado)
- [ ] Ordem de leitura correta (colunas, notas, títulos)
- [ ] Parágrafos separados/unidos corretamente
- [ ] Cabeçalhos, rodapés e números de página removidos, e nenhum conteúdo removido por engano
- [ ] Palavras hifenizadas unidas; hifens legítimos preservados (ex.: guarda-chuva, well-known)
- [ ] Acentos e caracteres especiais corretos (ç ã õ é, aspas, travessões, ligaduras, grego/latim)
- [ ] Títulos detectados com nível plausível; sumário confere com o livro
- [ ] Negrito e itálico preservados e sem "vazar" para o texto vizinho
- [ ] Notas de rodapé ligadas à chamada correta (N3)
- [ ] Citações em bloco/epígrafes identificadas (N3)
- [ ] Blocos marcados com baixa confiança são mesmo os problemáticos

## Veredito da fase
- [ ] Posso ler um capítulo inteiro sem perceber falhas estruturais graves
- Problemas encontrados (cole IDs de bloco/página, **sem texto de livros com copyright**):

## Liberação
- [ ] Libero a próxima fase em `docs/extractor/STATE.md`
