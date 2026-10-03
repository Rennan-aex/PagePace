# Checklist manual: preparar o ambiente e o corpus (ações do PO)

- [ ] Repositório clonado; `pnpm install` e `pnpm verify` passam
- [ ] `CORPUS_PRIVATE_DIR` definido e a pasta existe, **fora** do repositório
- [ ] PDFs pessoais colocados lá (ver distribuição desejada em `docs/extractor/CORPUS.md`)
- [ ] `pnpm check:no-pdf` passa (nenhum PDF no git)
- [ ] GitHub: `main` protegida, check `verify` obrigatório, somente squash merge, apagar branch após merge
- [ ] OpenCode abre na raiz do repositório e lista as skills (ex.: `start-session`)
- [ ] Primeira sessão de IA: comandar "siga o AGENTS.md" e conferir que ela lê `docs/extractor/STATE.md`
