# Checklist manual: medições de desempenho no Android (E8-T04)

Medir no celular de verdade as 3 condições de reabertura da **ADR-005** (pedido do PO, 2026-10-04): **(a)** o scan com imagens pesadas `n1-en-lostworld`; **(b)** a página atípica de 2.427 ms do `n2-en-astrofisica`; **(c)** a memória real no Android (o `performance.memory` do navegador é grosseiro — usamos o `adb`, que é o medidor oficial do sistema).

Data: 2026-10-29 · Aparelho (marca/modelo/Android): Redmi Note 13 (Android 15, Chrome, Wi-Fi) · Commit: `07493b3` · Quem: PO (medições) + agente (análise)

## Pré-requisitos
- [x] Celular e PC na **mesma rede Wi-Fi** (o celular não pode estar só no dados móveis).
- [x] Chrome instalado no celular (é o proxy da WebView, ADR-001).
- [x] PDFs privados em `<CORPUS_PRIVATE_DIR>` no PC (nunca entram no celular nem no git).
- [x] Para a condição (c): cabo USB e `adb` (Android Platform-Tools) instalados no PC (`C:\Users\<usuario>\platform-tools\adb.exe`, 37.0.1).

## Passo 1 — subir o servidor no PC (PowerShell, pasta do projeto)

```powershell
cd C:\caminho\para\PagePace
node packages\extractor\spikes\s4-browser.mjs --serve --lan
```

Deve imprimir `Servidor do bench S4 no ar` e uma lista de URLs `http://<ip-do-pc>:<porta>/spikes/s4-bench.html?pdf=...`. Se o Windows pedir permissão de rede para o Node.js, **permita em redes privadas**. Se imprimir o aviso `sem --lan`, rode de novo com `--lan`.

Deixe este terminal aberto (ele é o servidor). Abra outro terminal para os passos seguintes.

## Passo 2 — rodar o bench no celular

No Chrome do celular, abra a URL mostrada no PC trocando o `pdf` pelo documento, começando pelo `(a)`:

- `http://<ip-do-pc>:<porta>/spikes/s4-bench.html?pdf=n1-en-lostworld&mode=worker`

A página carrega o PDF pelo Wi-Fi e roda a extração. Ao terminar ela mostra um **JSON com os números** (ms/página, p95 da página mais lenta, atraso máximo, pico de heap). **Fotografe a tela** (só os números, nunca páginas de livro — são PDFs privados).

Repita para os outros documentos de estresse e para o livro de referência de 500 páginas:

- `pdf=n2-en-astrofisica&mode=worker` (condição b)
- `pdf=n3-pt-filosofia2&mode=worker`
- `pdf=n1-pt-sofia&mode=worker` (referência: 494 páginas)

### Conferências
- [x] **(a)** `n1-en-lostworld` termina sem a aba travar, reiniciar ou mostrar "página sem resposta" — **terminou** (667,13 ms/pág, p95 932 ms, 2 min 33 s)
- [x] **(b)** `n2-en-astrofisica` termina e a página mais lenta (campo `p95`) está **abaixo de 5.000 ms** — **p95 = 3.133,3 ms ✅** (o valor antigo de 2.427 ms era do PC, no celular o número naturalmente maior, o critério é não travar)
- [x] Os 4 documentos terminam e o JSON aparece na tela (prints em `<CORPUS_PRIVATE_DIR>\Testes\`)

## Passo 3 — memória real no Android (condição c), com adb

No celular: **Ajustes → Sobre o telefone → toque 7 vezes em "Número da versão"** (libera Opções de desenvolvedor) e ligue **Depuração USB**. Conecte o cabo e authorize o PC no pop-up do celular.

No PC, confirme que o aparelho aparece:

```powershell
adb devices
```

Deve listar um aparelho com `device`. Se aparecer `unauthorized`, aceite o pop-up no celular de novo.

Abra no celular a página do bench (`pdf=n1-pt-sofia&mode=worker`) mas **não toque em iniciar ainda**. No PC, meça a memória **ociosa** (3 amostras bastam):

```powershell
adb shell dumpsys meminfo com.android.chrome | Select-String "TOTAL PSS"
```

Agora toque em iniciar no celular e, enquanto a extração roda, rode o laço de amostragem (Ctrl+C para parar):

```powershell
while ($true) { adb shell dumpsys meminfo com.android.chrome | Select-String "TOTAL PSS"; Start-Sleep -Milliseconds 200 }
```

Anote o **maior** `TOTAL PSS` (em kB) visto durante a extração.

### Conferência
- [x] **(c)** o pico durante a extração ficou **abaixo de 900 MB** ✅ — medido no **`n1-en-lostworld`** (pior caso, em vez do sofia): ocioso **290.164 / 290.032 / 290.036 kB (≈ 283 MB)** nas 3 amostras; durante a leitura ~255 MB; **pico 288.688 kB (≈ 282 MB)**. Orçamento do projeto: 300 MB de JS + margem para as estruturas nativas do Android (registre os números exatos — a ADR-005 é reaberta com esses dados, não com estimativas).

## Veredito

| Condição | Documento | Número medido | Passou? |
|---|---|---|---|
| (a) scan pesado sem travar | n1-en-lostworld | 667 ms/pág · p95 932 ms · trava máx 44 ms · total 152,9 s | [x] |
| (b) página atípica sem travar | n2-en-astrofisica | p95 3.133 ms (limite 5.000 ms) | [x] |
| (c) memória real | n1-en-lostworld (pior caso) | ocioso ≈ 283 MB · pico ≈ 282 MB (288.688 kB) | [x] |

Referências adicionais (mesma sessão): `n1-pt-sofia` **23,9 ms/pág** (494 p, 12,2 s — caso normal, 6× de folga sob 150 ms/pág), `n3-pt-filosofia2` 19,6 ms/pág, `n2-en-astrofisica` 486 ms/pág (14 p, conteúdo pesado). Bateria do aparelho a 17% nos testes de tempo — números conservadores (tendência a mais lentos). Prints em `<CORPUS_PRIVATE_DIR>\Testes\`.

- [x] **Se as 3 passaram:** a ADR-005 continua fechada. **PASSARAM AS 3 → ADR-005 segue `accepted`, não reaberta** (2026-10-29). Cole os 3 números na mensagem para o agente (sem fotos de livro) — feito.
- [ ] **Se alguma falhou:** a ADR-005 é reaberta (isso é esperado e útil) — cole os números e a descrição do que aconteceu (trava, reinício, mensagem de erro). *Não se aplica: as 3 passaram.*
