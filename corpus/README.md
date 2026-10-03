# corpus/

Conjunto de PDFs de teste do extrator. **Nenhum PDF é versionado.** Ver `docs/extractor/CORPUS.md` para a política completa.

```
corpus/
  manifest.yaml     lista de PDFs públicos (id, nível, idioma, licença, sha256...)   [git]
  golden/           gabaritos dos PDFs públicos                                      [git]
  public/           PDFs públicos baixados por `pnpm corpus:fetch`                    [ignorado]
```

## PDFs pessoais (com copyright)
Ficam **fora** do repositório. Defina a variável de ambiente e coloque lá os PDFs, o `manifest.yaml` privado e a pasta `golden/` privada:

```bash
# Linux/macOS (adicione ao seu shell profile)
export CORPUS_PRIVATE_DIR="$HOME/pagepace-corpus-private"
# Windows (PowerShell)
setx CORPUS_PRIVATE_DIR "C:\Users\<voce>\pagepace-corpus-private"
```

O runner de avaliação mescla os dois corpora automaticamente. Nada do corpus privado deve aparecer em commits, issues ou PRs.

## Níveis
N1 livro simples · N2 artigo em duas colunas · N3 filosofia com notas · N4 técnico (equações/tabelas) · N5 escaneado.

## Adicionar um PDF
Use a skill `add-corpus-pdf` (`.opencode/skills/add-corpus-pdf/SKILL.md`).
