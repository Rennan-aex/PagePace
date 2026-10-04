# Guia do PO: tudo o que é SEU fazer, em ordem

Coloque este arquivo em `docs/GUIA-DO-PO.md` do repositório. Todas as ações manuais do projeto estão aqui, em ordem. O que não está aqui, a IA faz.

**Regra de ouro para você:** faça um passo, confirme que funcionou (cada passo tem um "como saber que deu certo"), só então vá ao próximo. Se algo der erro, copie a mensagem inteira e me mostre.

---

## Passo 1 · Instalar as ferramentas (Windows)

Você precisa de 3 programas: **Git** (você provavelmente já tem, pois clonou), **Node.js** e **pnpm**. O erro que você viu significa que o `pnpm` não está instalado (e provavelmente o Node também não). Não precisa de PowerShell como administrador.

### 1.1 Node.js
1. Abra o PowerShell (normal) e digite: `node -v`
   - Se aparecer um número como `v22.x.x` ou `v20.x.x` (20 ou maior): pule para 1.2.
   - Se aparecer erro "não reconhecido": instale o Node.
2. Instalar: vá em https://nodejs.org e baixe a versão **LTS**, instale com tudo no padrão. (Alternativa pelo terminal: `winget install OpenJS.NodeJS.LTS`.)
3. **Feche TODAS as janelas do PowerShell e abra uma nova** (o Windows só atualiza o PATH em janelas novas).
4. `node -v` e `npm -v` agora devem mostrar números. ✅

### 1.2 pnpm
1. Digite: `npm install -g pnpm@9.15.0`
2. Feche e abra o PowerShell de novo. Digite: `pnpm -v` → deve mostrar `9.15.0`. ✅
3. Se aparecer um erro dizendo que *a execução de scripts foi desabilitada neste sistema* (fala de `pnpm.ps1`), rode uma vez:
   `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
   (responda `S` ou `Y`) e tente `pnpm -v` de novo.

### 1.3 Git
`git --version` deve mostrar um número. Se não, instale em https://git-scm.com.

---

## Passo 2 · Onde deixar o repositório

Prefira uma pasta **fora do OneDrive**, por exemplo `C:\dev\PagePace`. O OneDrive sincroniza milhares de arquivos de `node_modules` e costuma dar erros estranhos. Se o seu repositório já está dentro de `Documentos`/`OneDrive`, o mais simples é clonar de novo em `C:\dev`.

---

## Passo 3 · Instalar e verificar o projeto

Na pasta do repositório (no PowerShell: `cd C:\dev\PagePace`):

1. `pnpm install` → termina sem erro. ✅
2. `pnpm verify` → no final aparece `Tests 5 passed` e `OK: no PDFs tracked.` ✅
3. Commit inicial (se ainda não fez): `git add -A`, `git commit -m "chore: initial project planning and scaffold"`, `git push`.

---

## Passo 4 · A pasta de PDFs de teste (o "corpus privado")

**Entenda os nomes:** `CORPUS_PRIVATE_DIR` **não é o nome da pasta**. É o nome de uma *variável* que guarda o caminho da pasta. A pasta pode ter qualquer nome.

1. Crie a pasta **fora** do repositório, por exemplo:
   `New-Item -ItemType Directory -Path <CORPUS_PRIVATE_DIR>`
2. Diga ao projeto onde ela está. Faça **as duas** coisas abaixo (a segunda é a mais confiável):
   - Variável do Windows: `setx CORPUS_PRIVATE_DIR "<CORPUS_PRIVATE_DIR>"` e depois feche e reabra o PowerShell.
     Conferir: `echo $env:CORPUS_PRIVATE_DIR` → mostra `<CORPUS_PRIVATE_DIR>`. ✅
   - Arquivo `.env` na raiz do repositório (ele já é ignorado pelo git):
     `Set-Content -Path .env -Value 'CORPUS_PRIVATE_DIR=<CORPUS_PRIVATE_DIR>'`
3. Os agentes **não descobrem a pasta sozinhos**: eles usam essa variável (ou o `.env`). O OpenCode deve ser aberto a partir de um terminal aberto *depois* do `setx`. Se o agente não achar a pasta, é só dizer o caminho no prompt. O OpenCode pode pedir permissão para acessar uma pasta fora do projeto: aceite.

### Como nomear os PDFs
**Você não precisa seguir nenhum padrão.** Só jogue os PDFs dentro de `<CORPUS_PRIVATE_DIR>`. O `manifest.yaml`, os hashes (sha256) e os gabaritos (golden) são criados **pela IA**, você não escreve nada disso.

Para facilitar a sua vida (opcional, mas ajuda), use nomes curtos, sem acento e sem espaço, no formato `nivel-idioma-assunto.pdf`:
`n3-pt-etica-nicomaco.pdf` · `n2-en-attention-paper.pdf` · `n4-en-calculo-openstax.pdf`
Se errar o nível, não tem problema: a IA confere depois.

Níveis, em uma linha cada: **N1** livro simples, coluna única · **N2** artigo em duas colunas · **N3** filosofia com notas de rodapé e citações · **N4** técnico com equações/tabelas/código · **N5** escaneado.

### O que reunir para começar (mínimo de 8 PDFs; ideal 12)
| Nível | Quantos | Idiomas |
|---|---|---|
| N3 | 3 | pelo menos 1 pt e 1 en (**o mais importante**: são os livros que você realmente lê) |
| N2 | 2 | 1 en, 1 pt |
| N1 | 1–2 | o que tiver |
| N4 | 1–2 | 1 en, 1 pt se tiver |
| N5 | 1 | um escaneado qualquer (Internet Archive) |

**Seus próprios PDFs servem e são a melhor fonte**, porque representam o uso real. Como a pasta fica fora do git, direitos autorais não são problema. Os PDFs *públicos* (que o CI e IAs de nuvem conseguem baixar) só importam a partir do marco E1, e a IA ajuda a escolhê-los, então **não precisa resolver isso agora**.

### Onde achar PDFs de teste gratuitos
| Para | Fonte | Observação |
|---|---|---|
| N2 en | arXiv (arxiv.org) | Artigos em duas colunas. A licença varia por artigo e aparece na página do artigo. |
| N2 pt, N3 pt | SciELO (scielo.br) para artigos; SciELO Livros (livros.scielo.org) para livros acadêmicos de acesso aberto | Há títulos de filosofia; confira se têm notas de rodapé. |
| N3 pt | eduCAPES (educapes.capes.gov.br) | Livros digitais com licença Creative Commons. |
| N3 en, N4 | OpenStax (openstax.org) | PDF gratuito em todos os títulos. Para N3: *Introduction to Philosophy*. Para N4: Física, Cálculo, etc. A licença é CC BY ou CC BY-NC-SA, **conforme o livro** (a página de cada livro diz). |
| N5 | Internet Archive (archive.org) | Filtre por "Texts" e anos antigos, baixe em PDF. Costumam ser escaneados. |
| N5 pt | Domínio Público (dominiopublico.gov.br) | Obras brasileiras, muitas escaneadas. |
| N3 en clássicos | Early Modern Texts (earlymoderntexts.com) | Descartes, Hume, Locke etc. em PDF. **Não verifiquei a licença**; para uso só privado, tudo bem. |

O Project Gutenberg e o Standard Ebooks geralmente não oferecem PDF, só EPUB/HTML. Eles servem depois, como gabarito de estrutura (par PDF + EPUB).

---

## Passo 5 · Ajustes no GitHub (faça depois do primeiro push)
- **Proteger a `main`** (Settings → Rules/Branches): exigir pull request e o check `verify`. Atenção: em repositórios **privados no plano gratuito** esse recurso pode não estar disponível. Se não estiver, **pule**: a regra continua valendo por disciplina (AGENTS.md manda a IA trabalhar em branch e abrir PR).
- O check `verify` só aparece na lista depois que o workflow rodar uma vez (primeiro push em `main` ou primeiro PR).
- Merge: deixe só "Squash merge" e "Apagar branch após merge" (Settings → General → Pull Requests).

---

## Passo 6 · Rodar o OpenCode pela primeira vez
1. No PowerShell, `cd C:\dev\PagePace` e abra o OpenCode (se ainda não instalou: `npm install -g opencode-ai`, ou veja opencode.ai).
2. Confira que ele lista as skills (ex.: `start-session`).
3. Cole este prompt:

```
Siga o AGENTS.md e use a skill start-session.
Tarefa: E0-T01, só a parte da IA.
A pasta privada de PDFs está em <CORPUS_PRIVATE_DIR> (variável CORPUS_PRIVATE_DIR).
1) Liste os PDFs lá.
2) Crie lá o manifest.yaml privado com nível, idioma e features provisórios para cada PDF. Não copie nenhum PDF para dentro do repositório.
3) Na tarefa E1-T05 do arquivo docs/extractor/phases/E1-foundation.md, acrescente: o script deve ler CORPUS_PRIVATE_DIR do ambiente e, se ausente, do arquivo .env na raiz.
4) Rode a skill end-session.
Não faça mais nada além disso. Se tiver dúvida, escreva em OPEN-QUESTIONS.md e pare.
```

---

## Rotina de cada sessão (a partir daí)
1. Abra o OpenCode na raiz do repositório.
2. Prompt de início: `Siga o AGENTS.md e use a skill start-session. Faça somente a tarefa atual.`
3. Quando a IA terminar (ou os tokens acabarem), ela deve ter rodado `end-session`. **Confira** se `docs/extractor/STATE.md` mudou. Se os tokens acabaram antes, na próxima IA use o mesmo prompt de início: o STATE.md leva o contexto.
4. No fim de cada fase, rode a checklist de `tests/manual/` e libere a próxima fase no `STATE.md`.
5. Se a IA escrever algo em `docs/extractor/OPEN-QUESTIONS.md`, ela está esperando você. Responda (pode ser aqui comigo) e peça a ela para registrar a resposta.
