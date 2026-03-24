import writeXlsxFile from "write-excel-file/node";

const HEADER_ROW = [
  { value: "ticker", fontWeight: "bold" },
  { value: "tipo", fontWeight: "bold" },
];

const EXAMPLE_ROWS = [
  [{ value: "AAPL" }, { value: "STOCK" }],
  [{ value: "PETR4" }, { value: "ACAO" }],
  [{ value: "HGLG11" }, { value: "FII" }],
  [{ value: "TESOURO SELIC 2029" }, { value: "RF" }],
];

await writeXlsxFile([HEADER_ROW, ...EXAMPLE_ROWS], {
  filePath: new URL("../public/modelo-importacao.xlsx", import.meta.url).pathname,
});

console.log("Template generated: public/modelo-importacao.xlsx");
