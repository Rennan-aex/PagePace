# corpus/

Conjunto de PDFs de teste do extrator. **Nenhum PDF é versionado.** Ver `docs/extractor/CORPUS.md` para a política completa.

```
corpus/
  manifest.yaml     lista de PDFs públicos (id, nível, idioma, licença, sha256...)   [git]
  golden/           gabaritos dos PDFs públicos                                      [git]
  public/           PDFs públicos baixados por `pnpm corpus:fetch`                    [ignorado]
```

## Baixar os PDFs públicos

```bash
pnpm corpus:fetch          # baixa o que falta e valida o SHA-256 de tudo
pnpm corpus:fetch --help   # comportamento e códigos de saída
```

- Arquivo já presente com o hash certo → **nenhuma requisição** (é o que o cache do CI usa).
- Hash do arquivo baixado divergente → apaga o `.tmp` e sai com `exit 1`, mostrando o esperado × o obtido.
- Rede instável → **3 tentativas** (espera de 1 s e 2 s) em erro de rede, `5xx`, `429` ou `403`; os outros erros HTTP não repetem.
- URL principal esgotada → passa para a `fallback_urls` da entrada (mesmo SHA-256), na ordem do manifest — ADR-033.
- As requisições parecem um navegador (`accept`, `accept-language`, `referer` da página do artigo) e reenviam o cookie que o CDN devolve, porque o SciELO protege o endpoint de PDF (BunnyCDN).
- Fonte que bloqueia o CI → a `source_url` dos dois artigos do SciELO aponta para a entrega **`corpus-public-v1`** deste repositório (espelho com os mesmos bytes e o mesmo SHA-256 — ADR-034). No CI o script envia o `GITHUB_TOKEN` **só** para hosts do GitHub (`Bearer` + `Accept: application/octet-stream` na API); sem token (na sua máquina) a URL da API responde 404/401 de uma vez e o script cai para o `fallback_urls` do SciELO.
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

- Público: obrigatório `source_url` (URL direta do PDF) e `sha256`; opcional `fallback_urls: ["https://..."]` (URLs reserva, testadas em ordem se a principal falhar — ADR-033).
- Privado: obrigatório `file` (nome do PDF dentro da pasta privada) e `sha256`; **não** tem `source_url`.
- Linha na coluna 0 (`version:`, `documents:`, comentários, texto livre) é ignorada; linha indentada que não parseia é erro com o número da linha.

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

## Níveis
N1 livro simples · N2 artigo em duas colunas · N3 filosofia com notas · N4 técnico (equações/tabelas) · N5 escaneado.

## Adicionar um PDF
Use a skill `add-corpus-pdf` (`.opencode/skills/add-corpus-pdf/SKILL.md`). Se o site da nova fonte bloquear os endereços do GitHub (403 no CI), suba o PDF numa entrega (Release) do repositório e use a URL da API do asset como `source_url` — mesmo caminho dos artigos do SciELO (ADR-034).
