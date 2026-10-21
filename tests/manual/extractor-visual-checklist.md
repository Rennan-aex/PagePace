# Checklist manual: conferência visual da extração

Executar ao fim de cada fase do extrator (E2–E8) com `pagepace inspect <pdf>` (relatório lado a lado: página original × blocos extraídos, com flags de confiança — formatos `text`, `md` e `html`, ver `packages/cli/README.md`). Use 1 livro N1, 1 artigo N2 e 1 livro de filosofia N3 (pelo menos um em pt e um em en).

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

## Como rodar (PowerShell, testado em 2026-10-11)

Pasta dos comandos: `C:\caminho\para\PagePace`.
Os PDFs privados estão em `<CORPUS_PRIVATE_DIR>` (nunca entram no git).

**(1) Gerar o JSON de um livro** — uma vez por livro, leva ~5 s:

```powershell
pnpm -s pagepace extract <CORPUS_PRIVATE_DIR>\n1-pt-sofia.pdf > $env:TEMP\sofia.json
```

Deve terminar sem mensagem de erro e criar o arquivo em `C:\Users\<voce>\AppData\Local\Temp`.
Se der erro: cole a mensagem inteira. Livros usados nos checklists:
`n1-pt-sofia`, `n1-en-curinga` (E2) · `n1-pt-curinga`, `n1-en-sofia` (E3).

**(2) Ver os parágrafos de uma página** — troque o número em `$pag`
(é a página **menos 1**: `$pag = 11` mostra a página 12 do leitor):

```powershell
$b = Get-Content "$env:TEMP\sofia.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$pag = 11
$b.blocks | Where-Object { $_.origin.pageFrom -eq $pag } | ForEach-Object {
  $t = ($_.runs | ForEach-Object { $_.text }) -join ''
  "--- pagina {0} [{1}] confianca {2}" -f ($_.origin.pageFrom + 1), $_.kind, $_.confidence
  $t
}
```

Deve aparecer o texto da página em blocos separados, com acentos certos.
O que conferir (E2): texto corrido em blocos, espaços no lugar, sem linha cortada no meio.

**(3) Achar cabeçalho/rodapé esquecido** — repete o texto em 4 ou mais páginas:

```powershell
$map = @{}
foreach ($blk in $b.blocks) {
  $t = (($blk.runs | ForEach-Object { $_.text }) -join '').Trim()
  if ($t.Length -gt 2) { if ($map.ContainsKey($t)) { $map[$t]++ } else { $map[$t] = 1 } }
}
$map.GetEnumerator() | Where-Object { $_.Value -ge 4 } | Sort-Object Value -Descending | Format-Table -AutoSize
```

Deve aparecer **só texto que faz parte da história** (ex.: uma saudação de carta que
repete no livro, ou `* * *` de cena). **Errado:** título do capítulo repetido em toda página.

**(4) Achar número de página esquecido** — deve dar `0`:

```powershell
@($b.blocks | Where-Object { ((($_.runs | ForEach-Object { $_.text }) -join '') -match '^\s*(p\.?\s*)?\d{1,4}\s*$') }).Count
```

**(5) Conferir hifenização (E3)** — lista as palavras com hífen da página;
hífen legítimo (guarda-chuva, well-known) fica; palavra cortada na quebra de linha
(exem-plo) não pode aparecer:

```powershell
$pag = 11
$b.blocks | Where-Object { $_.origin.pageFrom -eq $pag } | ForEach-Object {
  $t = ($_.runs | ForEach-Object { $_.text }) -join ''
  [regex]::Matches($t, '\S{0,20}-\S{0,20}') | ForEach-Object { $_.Value }
}
```

Para a E3, repita (2) e (5) em **3 páginas** de `n1-pt-sofia` (comece por
`$pag = 11`, `$pag = 100`, `$pag = 250`) e faça (3) e (4) em `n1-pt-curinga`
e `n1-en-sofia`.

**(6) Relatório lado a lado (E7)** — gera um HTML com a página original ao
lado dos blocos extraídos; blocos com flags de dúvida aparecem em vermelho
(abra o arquivo no navegador):

```powershell
pnpm pagepace inspect <CORPUS_PRIVATE_DIR>\n1-pt-sofia.pdf --pages 10-12 --format html --out $env:TEMP\sofia.html
Start-Process "$env:TEMP\sofia.html"
```

Deve abrir o navegador com as 3 páginas. Errado: página em branco (render
falhou) ou bloco vermelho que na verdade está certo (falso alarme de flag).

**(7) Por que a página saiu assim (E7)** — a decisão de cada camada de uma
página, parágrafo a parágrafo (troque o número da página):

```powershell
pnpm -s pagepace explain-page <CORPUS_PRIVATE_DIR>\n1-pt-sofia.pdf 12
```

Deve listar os blocos com `kind`, `confiança`, `flags` e o bloco `camadas:`
com a decisão de cada camada. Confira que o `kind` impresso é o mesmo do
passo (2) para os mesmos blocos.

