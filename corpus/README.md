# corpus/

Conjunto de PDFs de teste do extrator. **Nenhum PDF é versionado**, com uma única exceção: os 2 artigos do SciELO em `vendored/` (cópias byte a byte, ADR-103). Ver `docs/extractor/CORPUS.md` para a política completa.

```
corpus/
  manifest.yaml     lista de PDFs públicos (id, nível, idioma, licença, sha256...)   [git]
  golden/           gabaritos dos PDFs públicos                                      [git]
  sentences/        corpus anotado de frases pt/en (SEG-T05, texto público)          [git]
  vendored/         2 PDFs do SciELO versionados (única exceção da regra)            [git]
  public/           PDFs públicos baixados por `pnpm corpus:fetch`                    [ignorado]
    synthetic/      PDFs sintéticos gerados a partir das especificações               [ignorado]
```

## Baixar os PDFs públicos

```bash
pnpm corpus:fetch          # baixa o que falta + gera os sintéticos que faltarem
pnpm corpus:fetch --help   # comportamento e códigos de saída
```

- Arquivo já presente com o hash certo → **nenhuma requisição** (é o que o cache do CI usa).
- Entrada com `vendored: <caminho>` (os 2 do SciELO) → o `corpus:fetch` **copia** o arquivo de `corpus/vendored/` para `corpus/public/` **sem rede nenhuma**, conferindo antes o SHA-256 do manifest — divergindo = `exit 1`. Detalhes e licenças em `corpus/vendored/README.md`.
- Hash do arquivo baixado divergente → apaga o `.tmp` e sai com `exit 1`, mostrando o esperado × o obtido.
- Entrada com `generated: true` (sintético) → o PDF é **construído** a partir de `packages/eval/src/specs.ts` se faltar; se o SHA-256 não bater com o manifest, falha dizendo para rodar `pnpm corpus:synthetic` (nunca sobrescreve sozinho).
- Rede instável → **3 tentativas** (espera de 1 s e 2 s) em erro de rede, `5xx`, `429` ou `403`; os outros erros HTTP não repetem.
- URL principal esgotada → passa para a `fallback_urls` da entrada (mesmo SHA-256), na ordem do manifest — ADR-033.
- As requisições parecem um navegador (`accept`, `accept-language`, `referer` da página do artigo) e reenviam o cookie que o CDN devolve, porque o SciELO protege o endpoint de PDF (BunnyCDN).
- Fonte que bloqueia o CI → o SciELO (BunnyCDN) responde `403` para a faixa de IP do GitHub Actions (ADR-034), então os 2 artigos **não têm `source_url`**: eles vivem versionados em `corpus/vendored/` e o script só os copia. Nenhuma entrada pública precisa mais de `GITHUB_TOKEN` (o token segue disponível no CI para uma fonte GitHub futura).
- PDF no disco **sem entrada** no manifest → aviso, sem falhar (é assim que a E1-T05b aparece).
- Sem `CORPUS_PRIVATE_DIR` → **um aviso só** e `exit 0`: o corpus público é suficiente.
- No CI, `corpus/public/` fica em cache (`actions/cache`) com chave derivada do `manifest.yaml` — ver ADR-032.

## Manifest
`corpus/manifest.yaml` (público) e `$CORPUS_PRIVATE_DIR/manifest.yaml` (privado) usam o mesmo formato:

```yaml
version: 1
documents:
  - id: n1-exemplo            # entrada começa com "  - id: "
    level: N1                 # campos indentados com 4 espaços
    sha256: "<64 hex>"
    visibility: public
```

- Público: `source_url` (URL direta do PDF) **ou** `vendored: "corpus/vendored/x.pdf"` (cópia versionada no git, sem rede no fetch — ADR-103), mais `sha256`; opcional `fallback_urls: ["https://..."]` (URLs reserva, testadas em ordem se a principal falhar — ADR-033).
- **Sintético (ADR-037):** `generated: true` **no lugar** de `source_url` (os dois juntos = erro; `generated: yes` = erro, o campo é booleano). O PDF fica em `corpus/public/synthetic/<id>.pdf` e é construído pelo gerador — nunca é baixado. No manifest **privado** esse campo é proibido.
- Privado: obrigatório `file` (nome do PDF dentro da pasta privada) e `sha256`; **não** tem `source_url`.
- Linha na coluna 0 (`version:`, `documents:`, comentários, texto livre) é ignorada; linha indentada que não parseia é erro com o número da linha.

## PDFs sintéticos (gerados)
Cinco documentos `syn-*` cuja **especificação é a própria verdade** (`packages/eval/src/specs.ts`) — gerador determinístico do `@pagepace/eval` sobre o `minipdf`, sem dependência nova (ADR-013/036):

```bash
pnpm corpus:synthetic          # grava os PDFs em corpus/public/synthetic/ e os goldens em corpus/golden/
pnpm corpus:synthetic --check  # só valida (spec × manifest × golden em disco), sem gravar
```

- **Versionados:** as especificações, o gerador e os `corpus/golden/*.golden.json`. **Ignorados:** os PDFs (`corpus/public/synthetic/`).
- O script **só regrava quando o conteúdo muda** (git fica limpo em execução repetida) e falha se o `sha256` do manifest divergir do que a spec gera.
- Os 5 são **casos controlados** para a avaliação: heurística nova deve continuar dando `text_cer = 0` neles; eles **não contam** na cobertura de níveis do `CORPUS.md`.

## PDFs pessoais (com copyright)
Ficam **fora** do repositório. O script lê `CORPUS_PRIVATE_DIR` da **variável de ambiente** ou, na falta dela, de um arquivo `.env` na raiz (ignorado pelo git):

```dotenv
CORPUS_PRIVATE_DIR=C:\Users\<voce>\pagepace-corpus-private
```

```bash
# Linux/macOS (adicione ao seu shell profile)
export CORPUS_PRIVATE_DIR="$HOME/pagepace-corpus-private"
# Windows (PowerShell)
setx CORPUS_PRIVATE_DIR "C:\Users\<voce>\pagepace-corpus-private"
```

A variável de ambiente **vence** sobre o `.env`. O runner de avaliação mescla os dois corpora automaticamente. Nada do corpus privado deve aparecer em commits, issues ou PRs.

## Corpus anotado de frases (`sentences/`)
Texto de **domínio público** para medir o segmentador de frases (`sentence_f1`, SEG-T05). Um JSON por documento, com `format: 1`, `id` (= nome do arquivo), `lang` (`pt`/`en`), `source` (citação + domínio público) e `sentences` (as frases anotadas, em ordem).

- O texto entregue ao segmentador é `sentences.join(" ")`, e cada fronteira é o fim aparado de uma frase (a última não conta: é o fim do texto).
- Convenção de frase: o trecho máximo terminado em `. ! ? …`, mais fechamentos (`" ' ” ’ » ) ] }`). Uma fala pode virar duas frases quando tem pontuação final no meio.
- Medido pelo `pnpm eval` (seção "Sentence segmentation"), gravado em `packages/eval/baseline.json` como `sentence_f1`; `--ci` falha se piorar. Meta de aceite: **≥ 0,97**.
- Regra de ouro da leitura: só entra obra de domínio público, com a fonte no campo `source`; nada de texto de livro com copyright.

## Níveis
N1 livro simples · N2 artigo em duas colunas · N3 filosofia com notas · N4 técnico (equações/tabelas) · N5 escaneado.

## Adicionar um PDF
Use a skill `add-corpus-pdf` (`.opencode/skills/add-corpus-pdf/SKILL.md`). Se o site da nova fonte bloquear os endereços do GitHub (403 no CI), a saída é versionar o PDF em `corpus/vendored/` com a entrada `vendored:` no manifest e um `README.md` com a licença (mesmo caminho dos artigos do SciELO — ADR-103) ou trocar de fonte. A antiga saída (espelho numa entrega/Release do repositório) foi removida junto com a `corpus-public-v1`.
