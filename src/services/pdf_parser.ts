import pdf from "pdf-extraction";

export async function parsePDF(base64Data: string): Promise<{ text: string }> {
  const buffer = Buffer.from(base64Data, "base64");
  const data = await pdf(buffer);
  return { text: data.text };
}
