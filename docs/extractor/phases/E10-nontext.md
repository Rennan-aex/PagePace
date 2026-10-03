# E10 · Tabelas, equações e figuras

**Requisitos:** REQ-EXT-11. **Depende de:** E5/E6. **Saída:** blocos `figure|table|equation` corretos e fora do fluxo de leitura dinâmica.

## Tarefas
### E10-T01 · Figuras
- Detectar imagens/vetores relevantes (`nonText`) e criar `figure` com `origin.bbox` e `caption` ligada. **Aceite:** fixtures; legendas associadas.
### E10-T02 · Tabelas
- Detectar tabelas por alinhamento de colunas/linhas de grade; bloco `table` com `placeholder` e, se possível, células. **Aceite:** metade das tabelas simples do corpus N4 detectadas; nunca misturar células no texto corrido.
### E10-T03 · Equações
- Detectar linhas com fontes matemáticas/símbolos; bloco `equation` (placeholder com recorte de página). **Aceite:** equações não entram no texto do parágrafo como lixo.
### E10-T04 · Recortes de imagem (depende de OPEN-QUESTIONS #1)
- API para renderizar a região do bloco (PDF.js) para o app exibir em modo normal. **Aceite:** função com teste; decisão de produto registrada.
