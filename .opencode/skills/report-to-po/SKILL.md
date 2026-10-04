---
name: report-to-po
description: Use SEMPRE ao final de cada sessão, e sempre que precisar pedir algo ou fazer uma pergunta ao usuário (o PO). Define como falar com ele: linguagem simples, passos exatos para Windows PowerShell e perguntas com opções. O PO é iniciante, está sozinho no projeto e não conhece vocabulário de git, CI ou terminal.
---

# Falar com o PO (relatório e pedidos)

Quem lê é uma pessoa **iniciante em programação**, no **Windows (PowerShell)**, trabalhando sozinha. Ela entende muito bem o produto, mas não o jargão. Seu trabalho de comunicação só termina quando ela souber **exatamente o que fazer em seguida**, sem precisar abrir outro arquivo para entender.

## Regras de linguagem
1. Português do Brasil, frases curtas, palavras do dia a dia. Trate o PO por "você" (nunca "o PO").
2. **Termo técnico: explique na primeira vez, em até 10 palavras, entre parênteses.** Ex.: "faça o commit (salvar uma versão do projeto no histórico)". Se o termo é desnecessário, troque por palavras simples.
3. **Nunca aponte para um arquivo sem dizer o que fazer com ele.** Errado: "ver item 4 do OPEN-QUESTIONS". Certo: escreva a pergunta inteira na mensagem.
4. **Nunca peça algo que você mesmo pode fazer.** Se não puder (ex.: falta uma ferramenta instalada), diga por que e dê o caminho manual.
5. Comandos sempre para **PowerShell do Windows** (não bash), em bloco de código, **um comando por linha**, dizendo antes em qual pasta rodar. Nada de `&&`, `export`, `rm`, `cat`. Use `cd`, `Set-Content`, `Get-ChildItem`, `git ...`, `pnpm ...`.
6. Para cada ação, diga **como saber que deu certo** e **o que fazer se der errado** (pedir que cole a mensagem de erro inteira).
7. Máximo de **3 decisões** por mensagem. Se houver mais, priorize e deixe o resto para depois.
8. Se o PO responder "explica", "não entendi" ou parecido: explique de novo mais simples, com uma analogia, sem repetir a mesma frase.

## Formato obrigatório do relatório de fim de sessão
Sempre use exatamente estas 5 seções, nesta ordem e com estes títulos. Se uma seção estiver vazia, escreva "Nada.". Tamanho total: até ~25 linhas.

1. **Resumo** (2–3 frases): o que ficou pronto, em linguagem simples, dizendo para que serve.
2. **Deu certo / Atenção**: `✅` o que funcionou e foi testado; `⚠️` o que ficou pela metade ou com risco.
3. **O QUE VOCÊ PRECISA FAZER AGORA**: lista numerada. Cada item tem: o que fazer (uma frase), a pasta, os comandos, "Deve aparecer:" e "Se der erro:". Se não há nada: "Nada. Pode ir para a próxima sessão."
4. **DECISÕES QUE PRECISO DE VOCÊ**: para cada uma: a pergunta completa, 2–3 opções (A, B, C) com o que muda na prática, **minha recomendação e o motivo**. Termine com: "Responda só com a letra (ex.: 1A, 2B)."
5. **PRÓXIMA SESSÃO**: o texto exato para colar no OpenCode (em bloco de código) e o que a IA vai fazer na próxima tarefa, em 1 frase.

## Pedidos de ação no meio da sessão
Se precisar parar para pedir algo ao PO (ex.: ele deve baixar um arquivo), use as seções 3 e 4 do formato acima, só elas, e pare.

## Sobre STATE.md e OPEN-QUESTIONS.md
Esses arquivos são para as IAs. Mas **todo item escrito na seção "Bloqueios / ações do humano"** deve conter o passo a passo completo (comandos e como conferir), para o PO poder agir só lendo o item. Perguntas em `OPEN-QUESTIONS.md` devem trazer a pergunta completa, as opções e a recomendação. Evite siglas internas (E1-T05 etc.) sem dizer em palavras do que se trata.

## Exemplo curto de bom relatório
**Resumo:** Organizei os 13 PDFs de teste e criei a lista que descreve cada um. Isso permite que a próxima tarefa leia os PDFs sem eu precisar mexer no repositório.

**Deu certo / Atenção:** ✅ `pnpm verify` passou. ⚠️ Dois PDFs parecem curtos demais.

**O QUE VOCÊ PRECISA FAZER AGORA**
1. Enviar o trabalho para o GitHub (o site onde o projeto fica guardado). No PowerShell, na pasta `C:\dev\PagePace`:
```
git push -u origin e0-t01-corpus-inicial
```
Deve aparecer: uma linha com `e0-t01-corpus-inicial -> e0-t01-corpus-inicial`. Se der erro: cole aqui a mensagem inteira.
2. No site github.com, abra o repositório, clique em **Compare & pull request** (pedir para juntar este trabalho à versão principal), depois em **Create pull request**.

**DECISÕES QUE PRECISO DE VOCÊ**
1. O PDF `n5-en-newton.pdf` tem só 322 KB. Posso usá-lo assim mesmo?
   A) Sim, serve só para testar "detectar PDF escaneado" por enquanto. B) Prefiro trocar por outro mais completo.
   Recomendo A: a leitura de escaneados só entra bem mais tarde.
Responda só com a letra (ex.: 1A).

**PRÓXIMA SESSÃO**
```
Siga o AGENTS.md e use a skill start-session. Faça somente a tarefa E0-T02 (investigar o que a biblioteca PDF.js consegue ler dos PDFs).
```
