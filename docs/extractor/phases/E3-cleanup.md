# E3 · Limpeza: cabeçalhos/rodapés, hifenização, junção, unicode

**Objetivo:** texto limpo e contínuo, pronto para leitura dinâmica.
**Requisitos:** REQ-EXT-06, 07, 18.
**Depende de:** E2.
**Critério de saída:** metas `header_footer_f1`, `hyphen_join_acc` e `text_cer` atingidas em N1–N3.

## Tarefas

### E3-T01 · Normalização unicode
- NFC, ligaduras (ﬁ ﬂ ﬀ ﬃ ﬄ), soft hyphen (U+00AD), aspas/apóstrofos consistentes, espaços não separáveis, caracteres de controle.
- **Aceite:** tabela de casos testada; gregos e latinos acentuados preservados; sem alteração de letras de pt (ç, ã, õ, etc.).

### E3-T01b · Recomposição de acento destacado (LaTeX) · prioridade P1
- PDFs gerados por LaTeX emitem o acento (´ ` ¸ ˜ ˆ) como **item separado sobrepondo a letra** (spike S1: 9.013 ocorrências em `n4-pt-astrofisica`, 92% dos solapamentos do arquivo; NFC não resolve porque é caractere espaçado, não combining). Compor o item de acento com o primeiro caractere do item seguinte quando as caixas se sobrepõem (`EXERC´ICIOS` → `EXERCÍCIOS`, `Solu¸c˜ao` → `Solução`).
- **Aceite:** `spaceAccent` cai para 0 em n4 sem piorar `text_cer` nos demais PDFs do corpus (regra de ouro das métricas); teste com fixture reproduzindo o padrão do LaTeX; acentos legítimos isolados (sinal de menos, aspas) não são tocados.

### E3-T02 · Regiões repetidas (cabeçalho/rodapé/números de página)
- Detectar texto que se repete (ou varia só por número) em posição vertical estável entre páginas; remover do fluxo, guardar `originalPageLabel` como metadado.
- **Aceite:** `header_footer_f1` ≥ meta em N1–N3; cuidado com capítulos que começam com título no topo (não remover); teste de falso positivo.

### E3-T03 · Hifenização de fim de linha (pt/en)
- Unir `pala-` + `vra` → `palavra`; preservar hifens legítimos (`guarda-chuva`, `well-known`, ênclise `disse-lhe`) com regras e, se preciso, léxico pequeno por idioma.
- **Aceite:** `hyphen_join_acc` ≥ meta; conjunto de casos pt e en no teste; casos duvidosos marcam `flags: ["uncertain-hyphen"]` e baixam confiança.

### E3-T04 · Junção entre páginas
- Parágrafo que continua na página seguinte vira um bloco só (sinais: última linha da página sem ponto/fecha e primeira da seguinte sem recuo); inclui palavra hifenizada que cruza a página.
- **Aceite:** teste com fixtures de 2 páginas; `para_boundary_f1` não piora; `origin.pageFrom/pageTo` corretos.

### E3-T05 · Detecção de fontes com mapeamento quebrado
- Detectar texto embaralhado/privado (PUA, `\ufffd` frequente) e marcar `warnings`/baixa confiança em vez de produzir lixo silencioso.
- **Aceite:** fixture com texto corrompido gera aviso explícito.

## Checklist manual do PO
- [ ] Conferi cabeçalhos/rodapés removidos em 2 livros e nenhum conteúdo foi perdido.
- [ ] Conferi hifenização em 3 páginas de livro pt.
