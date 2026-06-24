declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages: number;
  }

  function pdfParse(data: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
