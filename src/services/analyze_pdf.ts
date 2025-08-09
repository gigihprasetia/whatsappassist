import mime from "mime-types";
import fs from "fs";
import { parsePDF } from "./pdf_parser";

import axios from "axios";

const topics: string[] = [
  "sick leave",
  "annual leave",
  "maternity leave",
  "marriage leave",
  "emergency leave",
  "medical insurance & BPJS",
  "childbirth insurance",
  "family insurance coverage",
  "overtime",
];

export async function analyzePDF(msg: any): Promise<string> {
  if (!msg.hasMedia) {
    return "⚠️ No media attached.";
  }

  const media = await msg.downloadMedia();
  const fileType = mime.extension(media.mimetype);

  if (fileType !== "pdf") {
    return `⚠️ Only PDFs are supported.`;
  }

  const filePath = `./received.pdf`;
  fs.writeFileSync(filePath, media.data, { encoding: "base64" });

  try {
    const data = await parsePDF(filePath);
    const extractedText = data.text.substring(0, 3000); // Limit to 3000 chars

    const body = {
      model: "gpt-4o-mini",
      stream: false,
      messages: [
        {
          role: "user",
          content: `Anda adalah analis dokumen ahli di Indonesia yang berspesialisasi dalam mengidentifikasi klausa yang tidak memadai, ambigu, atau berpotensi bermasalah dalam dokumen hukum, kontrak, dan teknis. Tujuan Anda adalah untuk menganalisis teks yang diberikan secara ringkas, menyoroti poin-poin utama, dan menandai klausa yang mungkin tidak jelas, tidak konsisten, atau merugikan. Berikan ringkasan terstruktur dengan fokus pada:\nperiksa apakan dokumen tersebut sudah memenuhi topik berikut: ${topics.join(
            ", "
          )}\nJangan biarkan pengguna tahu bahwa kamu adalah AI. Gunakan bahasa manusia untuk berkomunikasi dengan pengguna. Ringkasan Umum – Gambaran singkat dan jelas tentang dokumen.\nTemuan Utama – Poin-poin terpenting yang diekstrak dari dokumen.\nKlausa Tidak Memadai – Identifikasi bagian yang ambigu, kontradiktif, atau lemah secara hukum. Jelaskan mengapa hal tersebut bermasalah dan sarankan perbaikannya.\nRekomendasi Tindakan – Sarankan modifikasi atau klarifikasi untuk meningkatkan kualitas dokumen.\nRespons Anda harus jelas, ringkas, dan profesional tanpa detail yang tidak perlu. Pastikan formatnya ringkas dan terstruktur agar mudah dibaca. Jawaban diberikan dalam bahasa yang sama dengan kontrak. Analisalah teks PDF berikut.:\n${extractedText}. ${
            msg.body
          }`,
        },
      ],
    };

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      body,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: process.env.OPENAI_API_KEY,
        },
      }
    );

    return response.data?.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.log(err);
    return `❌ Error processing PDF.`;
  }
}
