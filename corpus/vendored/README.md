# corpus/vendored/

Aqui ficam os **dois PDFs versionados** do repositório. É a única exceção da
regra "nenhum PDF no git" (AGENTS.md, regra 1): são cópias **byte a byte** dos
artigos do SciELO, que bloqueiam os endereços do GitHub Actions (403 medido na
faixa de IP, ADR-034), e que antes eram espelhados na entrega
`corpus-public-v1` (apagada em 2026-11-11 — ver ADR-103).

- **Propósito:** fixture de teste do PagePace (duas colunas, notas de rodapé,
  hifenização, quebras de parágrafo) nos níveis N3 dos dois idiomas.
- **Arquivo sem modificações:** nada foi editado, remontado ou recomposto;
  são exatamente os bytes publicados pela SciELO.
- **Como entram no corpus:** `pnpm corpus:fetch` **copia** de cá para
  `corpus/public/` conferindo o SHA-256 do manifest, sem rede nenhuma.
- **Como são protegidos:** `pnpm check:no-pdf` só aceita no git os caminhos
  abaixo (caminho + SHA-256 vêm de `corpus/manifest.yaml`); qualquer outro
  `.pdf` no git reprova a verificação. Teste: `packages/eval/src/check-no-pdf.test.ts`.

## n3-pt-scielo-wittgenstein.pdf

| Campo | Valor |
|---|---|
| Título | Wittgenstein e o ceticismo |
| Autor | Daniel Temp |
| Publicação | Filosofia Unisinos, v. 27, n. 1 (2026), e27103 |
| DOI | [10.4013/fsu.2026.271.03](https://doi.org/10.4013/fsu.2026.271.03) |
| Página do artigo | <https://www.scielo.br/j/fun/a/v7bJr6JzbzbZgXj89dvS7BJ/?lang=pt> |
| Licença | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (Creative Commons Atribuição 4.0 Internacional) |
| SHA-256 | `f4013e92b72ad360ae6afba27dea7df8a7abb28ef4f75fd0a850281522dcbafb` |
| Tamanho | 596.315 bytes · 11 páginas |

## n3-en-scielo-climatejustice.pdf

| Campo | Valor |
|---|---|
| Título | Climate justice, land-use change emissions and global health |
| Autor | Milene Consenso Tonetto |
| Publicação | Filosofia Unisinos, v. 27, n. 1 (2026), e27117 |
| DOI | [10.4013/fsu.2026.271.17](https://doi.org/10.4013/fsu.2026.271.17) |
| Página do artigo | <https://www.scielo.br/j/fun/a/FGkJX86jxHMfgWwD6VqyZrm/?lang=en> |
| Licença | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (Creative Commons Attribution 4.0 International) |
| SHA-256 | `a3402300bc90f00685e8286001e5b69b9fffd4c832205370b87a1ccaf36d8a3a` |
| Tamanho | 694.609 bytes · 20 páginas |

Licenças verificadas nas páginas do artigo e no rodapé da p.1 de cada PDF em
**2026-11-11** (`verified_on` no `corpus/manifest.yaml`): ambos são publicados
em acesso aberto sob CC BY 4.0.
