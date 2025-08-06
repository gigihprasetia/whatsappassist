declare module 'pdf-extraction' {
  interface PDFData {
    text: string;
    numpages: number;
    info: any;
    metadata: any;
    version: string;
  }

  function extract(buffer: Buffer): Promise<PDFData>;
  export default extract;
}
