// E4-T04 acceptance: title, authors and language of a real PDF, combining
// the stopword lexicons with the PDF's own `/Info` + `/Lang` claims. The PDFs
// are written by `minipdf` (no corpus needed), so the path under test is the
// production one: ingestion, then `buildBook`.
import { buildBook, ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

const PT_PAGE = [
  textStream("O livro que ela comprou na cidade era muito interessante porque", { y: 700 }),
  textStream("contava a história de uma família que vivia no campo. A autora", { y: 685 }),
  textStream("descreve os personagens com cuidado e mostra como eles mudam.", { y: 670 }),
  textStream("Não é um romance simples, mas sim um estudo sobre a memória", { y: 655 }),
  textStream("e o tempo, escrito com muita atenção aos detalhes do cotidiano.", { y: 640 }),
].join("\n");

const EN_PAGE = [
  textStream("The book that she bought in the city was very interesting because", { y: 700 }),
  textStream("it told the story of a family who lived in the countryside. The", { y: 685 }),
  textStream("author describes the characters with care and shows how they", { y: 670 }),
  textStream("change over the years. It is not a simple novel, but a study of", { y: 655 }),
  textStream("memory and time, written with great attention to daily details.", { y: 640 }),
].join("\n");

describe("E4-T04 — metadata of a PDF", () => {
  it("takes title and authors from /Info and language from the text", async () => {
    const bytes = buildPdf([PT_PAGE], {
      info: { Title: "O Mundo de Sofia", Author: "Jostein Gaarder" },
      lang: "pt-BR",
    });
    const document = await ingestPdfjs(bytes, { fileName: "sofia.pdf" });
    expect(document.source.title).toBe("O Mundo de Sofia");
    expect(document.source.author).toBe("Jostein Gaarder");
    expect(document.source.lang).toBe("pt-BR");

    const book = buildBook(document);
    expect(book.metadata).toEqual({
      title: "O Mundo de Sofia",
      authors: ["Jostein Gaarder"],
      language: "pt",
    });
  });

  it("detects the language from the text when the PDF declares nothing", async () => {
    const bytes = buildPdf([EN_PAGE]);
    const document = await ingestPdfjs(bytes, { fileName: "plain.pdf" });
    expect(document.source.title).toBeUndefined();
    expect(document.source.lang).toBeUndefined();

    const book = buildBook(document);
    expect(book.metadata).toEqual({ language: "en" });
  });

  it("drops /Info values that are just the file name", async () => {
    const bytes = buildPdf([EN_PAGE], {
      info: { Title: "plain.pdf", Author: "   " },
    });
    const document = await ingestPdfjs(bytes, { fileName: "plain.pdf" });
    const book = buildBook(document);
    expect(book.metadata).toEqual({ language: "en" });
  });
});
