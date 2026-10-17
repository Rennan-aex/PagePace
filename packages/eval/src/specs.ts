// The synthetic documents of E1-T07 (and the region spec of E3-T02): the
// specifications are the versioned source of truth — `buildSynthetic(spec)`
// regenerates both the PDF (corpus/public/synthetic/) and the golden
// (corpus/golden/) from here.
//
// Every text is written for this repository (no third-party content), line
// breaks are explicit ("\n" inside a run) so the layout needs no width table,
// and lines stay inside the column: 78 characters for a full-width column,
// 38 for a two-column page, 95 at 9pt for the footnote.
import type { SyntheticSpec } from "./synthetic";

export const SYNTHETIC_SPECS: readonly SyntheticSpec[] = [
  {
    id: "syn-n1-en-paragraphs",
    level: "N1",
    lang: "en",
    title: "A Quiet Morning (synthetic)",
    features: ["synthetic"],
    pages: 2,
    blocks: [
      {
        kind: "heading",
        level: 1,
        page: 1,
        runs: [{ text: "A Quiet Morning" }],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "The light came slowly over the low hills, and the village\n" +
              "woke to the sound of a single bell. Doors opened, pots\n" +
              "were set on stoves, and the smell of bread drifted along\n" +
              "the narrow street that ran down to the river.\n" +
              "You could walk its whole length before the sun cleared\n" +
              "the roof of the old mill, and no one hurried.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "Beyond the bridge the road turned to gravel and then to\n" +
              "grass. Marta counted the turns she had learned as a child:\n" +
              "first the bent willow, then the stone with a flat top, then\n" +
              "the place where the stream crossed the path. She counted\n" +
              "them now out of habit, and because counting kept her even.",
          },
        ],
      },
      {
        kind: "heading",
        level: 2,
        page: 2,
        runs: [{ text: "The Long Path Home" }],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "Home was a house with a blue door and a garden that never\n" +
              "quite kept to its beds. Mint grew through the bricks and\n" +
              "tomatoes leaned on the fence, and in August the whole yard\n" +
              "smelled of warm leaves and dust.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "Her grandmother had planted the pear tree in the first\n" +
              "year they lived there. It was still small enough to shade\n" +
              "only the corner of the wall, but in autumn it gave four or\n" +
              "five fruits, enough for the whole street to taste.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "The evening ended the way it always did, with chairs\n" +
              "carried out to the pavement and the neighbours arguing\n" +
              "gently about weather and prices, until the first lamps\n" +
              "came on and the children were called in.",
          },
        ],
      },
    ],
  },
  {
    id: "syn-n1-pt-acentos",
    level: "N1",
    lang: "pt",
    title: "Uma manhã qualquer (synthetic)",
    features: ["synthetic"],
    pages: 2,
    blocks: [
      {
        kind: "heading",
        level: 1,
        page: 1,
        runs: [{ text: "Uma manhã qualquer" }],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "A manhã chegou devagar às colinas baixas e a vila\n" +
              "acordou com o som de um único sino. As portas se\n" +
              "abriram, as panelas foram ao fogo e o cheiro de pão\n" +
              "subiu pela rua estreita que descia até o rio.\n" +
              "Dava para atravessar a rua inteira antes que o sol\n" +
              "limpasse a cumprida do moinho velho, e ninguém tinha pressa.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "Além da ponte o caminho virava cascalho e depois capim.\n" +
              "Marta contava as curvas aprendidas na infância: o\n" +
              "salgueiro torto, a pedra de topo chato e o lugar onde\n" +
              "o riacho cruzava a trilha. Ainda contava por hábito,\n" +
              "e porque contar mantinha o passo igual.",
          },
        ],
      },
      {
        kind: "heading",
        level: 2,
        page: 2,
        runs: [{ text: "O jardim de dona Inês" }],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "A casa tinha uma porta azul e um jardim que nunca\n" +
              "ficava dentro dos canteiros. Hortelã crescia entre os\n" +
              "tijolos, os tomates se apoiavam na cerca e as folhas\n" +
              "de limão cobriam o muro nas razões do verão.\n" +
              "Havia uma saída estreita para os fundos.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "A avó plantou a pereira no primeiro ano em que moraram\n" +
              "ali. Ela ainda era pequena e dava sombra só à quina\n" +
              "da parede, mas no outono dava quatro ou cinco frutos\n" +
              "que bastavam para a avó pôr na mesa.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "O fim do dia terminava como sempre: cadeiras levadas\n" +
              "para a calçada e os vizinhos discutindo aos poucos\n" +
              "sobre o tempo e as razões do ano, até acender a\n" +
              "primeira luz e chamar os meninos para dentro.",
          },
        ],
      },
    ],
  },
  {
    id: "syn-n2-en-columns",
    level: "N2",
    lang: "en",
    title: "Notes on Light (synthetic)",
    features: ["synthetic", "two-column"],
    pages: 2,
    twoColumn: true,
    blocks: [
      {
        kind: "heading",
        level: 2,
        page: 1,
        column: 1,
        runs: [{ text: "Notes on Light" }],
      },
      {
        kind: "paragraph",
        page: 1,
        column: 1,
        runs: [
          {
            text:
              "Light is not a thing but a\n" +
              "way of seeing. The same room\n" +
              "holds a different room at\n" +
              "noon and at dusk, and the\n" +
              "walls keep both of them.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        column: 2,
        runs: [
          {
            text:
              "We name the hours by the sun\n" +
              "and then forget the sun, as\n" +
              "if the clock were a kind of\n" +
              "weather of its own, made of\n" +
              "metal and glass in the hall.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        column: 2,
        runs: [
          {
            text:
              "A window frames the same\n" +
              "street all day long. Only\n" +
              "the shadows move across it,\n" +
              "drawing slow lines on the\n" +
              "floor and then erasing them.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        column: 1,
        runs: [
          {
            text:
              "Ask ten people what light is\n" +
              "and you will hear ten\n" +
              "answers, none of them wrong:\n" +
              "a particle, a wave, a gift,\n" +
              "a habit of the morning.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        column: 1,
        runs: [
          {
            text:
              "The oldest lamp in the house\n" +
              "still sits above the door,\n" +
              "though nothing is lit with\n" +
              "it now. It keeps the shape\n" +
              "of the light it used to give.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        column: 2,
        runs: [
          {
            text:
              "Between the two columns of\n" +
              "this page runs a narrow\n" +
              "gutter, and the eye crosses\n" +
              "it without a sound, one\n" +
              "line after the other.",
          },
        ],
      },
    ],
  },
  {
    id: "syn-n2-pt-estilos",
    level: "N2",
    lang: "pt",
    title: "Estilos na página (synthetic)",
    features: ["synthetic", "styles"],
    pages: 2,
    blocks: [
      {
        kind: "heading",
        level: 1,
        page: 1,
        runs: [{ text: "Estilos na página" }],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          { text: "Um parágrafo comum pode conter uma\npalavra " },
          { text: "destacada", style: "bold" },
          { text: " no meio da linha,\ncomo acontece em avisos e\nrótulos de manuais." },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          { text: "Outras vezes o texto muda de voz no\nmeio da frase: um termo " },
          { text: "emprestado", style: "italic" },
          { text: ",\nque veio de outra língua e ficou\nno lugar sem tradução." },
        ],
      },
      {
        kind: "heading",
        level: 2,
        page: 2,
        runs: [{ text: "Trechos citados" }],
      },
      {
        kind: "blockquote",
        page: 2,
        indent: 24,
        runs: [
          {
            text:
              "Ler é deslocar o olho sem pressa, linha\n" +
              "após linha, até que a página pare de ser\n" +
              "uma superfície e vire um lugar onde\n" +
              "as coisas acontecem.",
          },
        ],
      },
      {
        kind: "list_item",
        page: 2,
        indent: 18,
        runs: [
          {
            text: "Primeiro ponto: a margem esquerda fica\nsempre no mesmo lugar.",
          },
        ],
      },
      {
        kind: "list_item",
        page: 2,
        indent: 18,
        runs: [
          {
            text: "Segundo ponto: o parágrafo seguinte\nrespeita a mesma régua.",
          },
        ],
      },
    ],
  },
  {
    // E5-T05: marked and numbered lists (the marker is printed in the text,
    // the items sit in a shallow indent) and figure/table captions (label +
    // separator, set smaller than the body) — the ground truth for the
    // `list_item` and `caption` kinds of `block_kind_f1`.
    id: "syn-n2-en-lists",
    level: "N2",
    lang: "en",
    title: "The Workshop Shelf (synthetic)",
    features: ["synthetic", "lists", "captions"],
    pages: 2,
    blocks: [
      {
        kind: "heading",
        level: 1,
        page: 1,
        runs: [{ text: "The Workshop Shelf" }],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "Every tool in the shelf has a place,\n" +
              "and every place has a rule that keeps\n" +
              "the shelf usable after a long week\n" +
              "of sawdust, oil and sudden repairs.",
          },
        ],
      },
      {
        kind: "list_item",
        page: 1,
        indent: 12,
        runs: [
          {
            text: "* Keep the morning tools dry\neven after a rush of work.",
          },
        ],
      },
      {
        kind: "list_item",
        page: 1,
        indent: 12,
        runs: [
          {
            text: "* Oil the hinge of the blue door\nevery month without exception.",
          },
        ],
      },
      {
        kind: "list_item",
        page: 1,
        indent: 12,
        runs: [
          {
            text: "1. Sweep the boards at noon,\nbefore the dust settles again.",
          },
        ],
      },
      {
        kind: "list_item",
        page: 1,
        indent: 12,
        runs: [
          {
            text: "2. Close the window before rain\nand latch it from the inside.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "A shelf that follows these lines\n" +
              "needs no inventory: the eye reads\n" +
              "the order before the mind does,\n" +
              "and the hand finds the tool alone.",
          },
        ],
      },
      {
        kind: "heading",
        level: 2,
        page: 2,
        runs: [{ text: "Plates and Tables" }],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "The lamp above the old door has\n" +
              "two hours of light on summer nights\n" +
              "and almost none in the wet months,\n" +
              "when the wind keeps everyone in.",
          },
        ],
      },
      {
        kind: "caption",
        page: 2,
        size: 9,
        runs: [{ text: "Fig. 1 - The lamp above the old door." }],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "The table below counts those hours\n" +
              "the way the grandmother counted them:\n" +
              "on fingers first, then on the wall\n" +
              "of the pantry, in pencil.",
          },
        ],
      },
      {
        kind: "caption",
        page: 2,
        size: 9,
        runs: [{ text: "Table 2 - Hours of light, by month." }],
      },
    ],
  },
  {
    id: "syn-n3-en-footnotes",
    level: "N3",
    lang: "en",
    title: "Two Notes on Memory (synthetic)",
    features: ["synthetic", "footnotes"],
    pages: 2,
    // Partial golden on purpose: only the footnote page is annotated, which
    // is what `coverage.pages` is for (the write-golden-test skill).
    coverage: [2],
    blocks: [
      {
        kind: "heading",
        level: 1,
        page: 1,
        runs: [{ text: "Two Notes on Memory" }],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "Memory is not a shelf where events wait in order. It is\n" +
              "closer to a room that is repainted every night, with the\n" +
              "furniture left where it stood. Some corners keep their\n" +
              "colour longer than others, and the places we return to\n" +
              "are painted again and again until they look fixed.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "This is why a smell can open a decade in a second and a\n" +
              "date can close it. The nose works faster than the\n" +
              "calendar, and it never asks for the year. A kitchen in\n" +
              "November can be older than the house it belongs to.",
          },
        ],
      },
      {
        kind: "heading",
        level: 2,
        page: 2,
        runs: [{ text: "A Short Argument" }],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "If memory repaints, then accuracy is not fidelity to\n" +
              "the first day but loyalty to the later ones. We keep\n" +
              "what we have agreed to keep, and we call the result\n" +
              "ourselves. The witness who hesitates may be the only\n" +
              "honest one in the room.",
          },
          // E5-T02: the superscript call of the note at the foot of this
          // page. The golden holds the label (`noteRef: "1"`), the PDF is
          // typeset with a text rise the extractor reads back as `sup`.
          { text: "1", style: "sup", noteRef: "1" },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "None of this makes memory useless. A tool that changes\n" +
              "with the hand is still a tool, and the stories we\n" +
              "retell are the only ones that survive a family.\n" +
              "The rest is weather.",
          },
        ],
      },
      {
        kind: "footnote",
        page: 2,
        position: "bottom",
        size: 9,
        runs: [
          {
            text:
              "1. The image of the repainted room is borrowed from a\n" +
              "seminar note taken in the winter of 2019 and copied here\n" +
              "without correction, which is the point of the footnote.",
          },
        ],
      },
    ],
  },
  {
    // E5-T03: the calls stand on page 1 and the notes at the end of page 2,
    // set in the BODY size inside the flow — the foot-region signals of
    // E5-T01 cannot see them, only the section title can. `footnote_link_acc`
    // scores (call page, label) pairs, so the notes living on another page
    // do not change it; `noteRef` is the ground truth of the link.
    id: "syn-n3-en-endnotes",
    level: "N3",
    lang: "en",
    title: "The Shape of a Note (synthetic)",
    features: ["synthetic", "endnotes"],
    pages: 2,
    blocks: [
      {
        kind: "heading",
        level: 1,
        page: 1,
        size: 18,
        runs: [{ text: "The Shape of a Note" }],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "A note is a second voice that speaks from the edge of the page.\n" +
              "It does not interrupt the sentence it belongs to; it waits until\n" +
              "the line has ended, then says what the line could not say without\n" +
              "stopping. A reader who ignores it loses nothing of the argument,\n" +
              "and a reader who follows it finds a smaller one running beside it.",
          },
          { text: "1", style: "sup", noteRef: "1" },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "The margin is where the two voices agree to live apart. One keeps\n" +
              "the claim moving forward, the other keeps the claim honest, and\n" +
              "neither pretends to be the other. A book that prints its notes at\n" +
              "the end simply walks to the other room for the second voice and\n" +
              "comes back with it under the arm, numbered in the order called.",
          },
          { text: "2", style: "sup", noteRef: "2" },
        ],
      },
      {
        kind: "heading",
        level: 2,
        page: 2,
        size: 16,
        runs: [{ text: "Notes" }],
      },
      {
        kind: "footnote",
        page: 2,
        runs: [
          {
            text:
              "1. The second voice is older than the argument it serves: the\n" +
              "first printers set it in smaller type so the reader could choose\n" +
              "between the two without losing the thread of either.",
          },
        ],
      },
      {
        kind: "footnote",
        page: 2,
        runs: [
          {
            text:
              "2. A note printed at the end keeps the page clean and asks more\n" +
              "of the reader, who must carry the number across the book and back,\n" +
              "the way this document asks you to do right now.",
          },
        ],
      },
    ],
  },
  {
    // E3-T02: a running head on the last three pages, a numbered foot on
    // every page, and a chapter title bigger than the body that must survive
    // all of it. The regions are printed in the PDF and never in the golden.
    id: "syn-n1-pt-cabecalhos",
    level: "N1",
    lang: "pt",
    title: "Uma estação do ano (synthetic)",
    features: ["synthetic", "headers"],
    pages: 4,
    blocks: [
      {
        kind: "heading",
        level: 1,
        page: 1,
        size: 18,
        runs: [{ text: "Uma estação do ano" }],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "A manhã chegou devagar às colinas baixas e a vila\n" +
              "acordou com o som de um único sino. As portas se\n" +
              "abriram, as panelas foram ao fogo e o cheiro de pão\n" +
              "subiu pela rua estreita que descia até o rio.\n" +
              "Dava para atravessar a rua antes que o sol limpasse\n" +
              "a cumprida do moinho velho.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "Além da ponte o caminho virava cascalho e depois capim.\n" +
              "Marta contava as curvas aprendidas na infância: o\n" +
              "salgueiro torto, a pedra de topo chato e o lugar onde\n" +
              "o riacho cruzava a trilha. Ainda contava por hábito,\n" +
              "e porque contar mantinha o passo igual.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        region: "footer",
        position: "bottom",
        size: 9,
        runs: [{ text: "1" }],
      },
      {
        kind: "paragraph",
        page: 2,
        region: "header",
        size: 9,
        runs: [{ text: "EXEMPLAR" }],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "O sol já alto aquecia os muros de pedra e as folhas\n" +
              "ficavam quietas. Sentava-se então à sombra da figueira\n" +
              "a olhar o campo, sem pressa de voltar, e o dia parecia\n" +
              "feito para aquilo só: esperar, respirar e deixar que o\n" +
              "calor subisse devagar pelas paredes.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "A tarde inteira coube ali, entre o riacho e a estrada\n" +
              "de terra. Quando o vento virava, trazia o cheiro das\n" +
              "folhas molhadas e o som distante do trator, que nem\n" +
              "sequer parecia pertencer àquele lugar.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        region: "footer",
        position: "bottom",
        size: 9,
        runs: [{ text: "2" }],
      },
      {
        kind: "paragraph",
        page: 3,
        region: "header",
        size: 9,
        runs: [{ text: "EXEMPLAR" }],
      },
      {
        kind: "paragraph",
        page: 3,
        runs: [
          {
            text:
              "A casa tinha uma porta azul e um jardim que nunca\n" +
              "ficava dentro dos canteiros. Hortelã crescia entre os\n" +
              "tijolos, os tomates se apoiavam na cerca e as folhas\n" +
              "de limão cobriam o muro nas razões do verão.\n" +
              "Havia uma saída estreita para os fundos.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 3,
        runs: [
          {
            text:
              "A avó plantou a pereira no primeiro ano em que moraram\n" +
              "ali. Ela ainda era pequena e dava sombra só à quina\n" +
              "da parede, mas no outono dava quatro ou cinco frutos\n" +
              "que bastavam para a mesa de todos os dias.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 3,
        region: "footer",
        position: "bottom",
        size: 9,
        runs: [{ text: "3" }],
      },
      {
        kind: "paragraph",
        page: 4,
        region: "header",
        size: 9,
        runs: [{ text: "EXEMPLAR" }],
      },
      {
        kind: "paragraph",
        page: 4,
        runs: [
          {
            text:
              "O fim do dia terminava como sempre: cadeiras levadas\n" +
              "para a calçada e os vizinhos discutindo aos poucos\n" +
              "sobre o tempo e as estações do ano, até acender a\n" +
              "primeira luz e chamar os meninos para dentro.\n" +
              "A rua ficava então em silêncio, medida pelos passos\n" +
              "de quem voltava devagar.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 4,
        runs: [
          {
            text:
              "No dia seguinte tudo recomeçava do mesmo jeito, com\n" +
              "o sino tocando cedo e o pão saindo quente. Nada\n" +
              "ganhava com pressa, e a vila seguia do tamanho\n" +
              "do seu caminho.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 4,
        region: "footer",
        position: "bottom",
        size: 9,
        runs: [{ text: "4" }],
      },
    ],
  },
  {
    // E3-T03: every line break below is a soft hyphen (U+00AD) — the PDF
    // prints the break with its `-`, and the golden holds the word the reader
    // must get. An explicit `-` before the marker is a hyphen the reader keeps
    // (`guarda-` + U+00AD + `chuva` → `guarda-chuva`); a bare marker is a
    // typesetting break to glue back (`pala` + U+00AD + `vra` → `palavra`).
    // Covers the four decisions of hyphenJoinDecision: join (palavra,
    // transporte), lexicon (guarda-chuva, segunda-feira, bem-estar), enclisis
    // (disse-lhe), digits (1998-2004) and the uncertain proper noun
    // (Ex-Ministro, which keeps its hyphen and carries the block flag). No
    // "\n" anywhere on purpose: the golden records no layout (ADR-039), so
    // the line-count test steps aside and the hyphen metric scores the rest.
    id: "syn-n1-pt-hifenizacao",
    level: "N1",
    lang: "pt",
    title: "Hifenização (synthetic)",
    features: ["synthetic", "hyphenation"],
    pages: 2,
    blocks: [
      {
        kind: "heading",
        level: 1,
        page: 1,
        runs: [{ text: "Hifenização" }],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "A pala\u00ADvra que con\u00ADtinua na linha seguinte " +
              "deve voltar inteira ao leitor, sem hífen e sem espaço.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "A guarda-\u00ADchuva abria quando ele disse-\u00ADlhe " +
              "a verdade sobre o dia inteiro.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "O trans\u00ADporte chegou e ficou de 1998-\u00AD2004 " +
              "sem parar na estrada de terra.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text: "O Ex-\u00ADMinistro saiu antes do almoço, sem anunciar a visita.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "Na segunda-\u00ADfeira o bem-\u00ADestar voltou à casa " +
              "e nada mais parecia urgente.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "O desenvolvi\u00ADmento do projeto seguiu de\u00ADpois " +
              "com o mesmo cuidado de sempre.",
          },
        ],
      },
    ],
  },
  {
    // E5-T04: an epigraph that opens the chapter (short, indented, italic,
    // with the attribution line) and a block quote inside the flow (indented
    // on every line, set smaller with a tighter leading). `block_kind_f1`
    // scores the kinds; the golden is the ground truth.
    id: "syn-n3-en-quotes",
    level: "N3",
    lang: "en",
    title: "The Space of a Quote (synthetic)",
    features: ["synthetic", "quotes"],
    pages: 2,
    blocks: [
      {
        kind: "heading",
        level: 1,
        page: 1,
        size: 18,
        runs: [{ text: "The Space of a Quote" }],
      },
      {
        kind: "epigraph",
        page: 1,
        indent: 36,
        size: 9,
        runs: [
          {
            text:
              "A quotation is a room built inside another room:\n" +
              "smaller, quieter, and entered on purpose.\n" +
              "-- A Reader",
            style: "italic",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "Every page carries at least two voices: the one that argues and\n" +
              "the one that answers. The second voice often lives in the margin,\n" +
              "set smaller than the body so the eye can choose which line to\n" +
              "follow. A book that hides the second voice pretends the argument\n" +
              "was always alone, and a book that enlarges it drowns the first.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 1,
        runs: [
          {
            text:
              "The typesetter knows this trade-off well. A footnote is a whisper\n" +
              "at the foot of the page; a block quote is a pause in the middle of\n" +
              "the claim, and an epigraph is the door left ajar before the chapter\n" +
              "begins. Each one asks the reader to slow down without asking the\n" +
              "reader to stop.",
          },
        ],
      },
      {
        kind: "heading",
        level: 2,
        page: 2,
        size: 14,
        runs: [{ text: "On Slowness" }],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "To read slowly is not to read less. It is to let each sentence\n" +
              "finish its work before the next one starts, and to notice when a\n" +
              "quotation has been set apart from the claim it serves.",
          },
        ],
      },
      {
        kind: "blockquote",
        page: 2,
        indent: 24,
        size: 10,
        leading: 14,
        runs: [
          {
            text:
              "The margin is where the two voices agree to\n" +
              "live apart. One keeps the claim moving forward,\n" +
              "the other keeps the claim honest, and neither\n" +
              "pretends to be the other. A reader who skips\n" +
              "the margin loses the argument the margin saved.",
          },
        ],
      },
      {
        kind: "paragraph",
        page: 2,
        runs: [
          {
            text:
              "When the quote ends, the body returns at the same size it left,\n" +
              "and the argument picks up the thread. Nothing was lost in the\n" +
              "detour; something was proved by it.",
          },
        ],
      },
    ],
  },
];

/** Looks one specification up by document id. */
export function syntheticSpecOf(id: string): SyntheticSpec | undefined {
  return SYNTHETIC_SPECS.find((spec) => spec.id === id);
}
