import fs from "fs";
import { exec } from "child_process";
import { Buffer } from "buffer";
import Tesseract from "tesseract.js";
import { getArticleContent } from "./scrap";
// @ts-ignore
import pdf from "pdf-extraction";

// Define the type for WhatsApp message
export interface MediaMessage {
  hasMedia: boolean;
  downloadMedia: () => Promise<{
    mimetype: string;
    data: string;
  }>;
  body?: string;
}

export async function parseVideo(videoData: string): Promise<string> {
  const filePath = "temp_video.mp4";
  fs.writeFileSync(filePath, Buffer.from(videoData, "base64"));

  return new Promise((resolve, reject) => {
    exec(`ffmpeg -i ${filePath} -f mp3 -ab 192000 -vn audio.mp3`, (error) => {
      if (error) return reject(error);
      // Call external API for transcription (e.g., OpenAI Whisper or Google Speech-to-Text)
      resolve("Transcribed text from video");
    });
  });
}

export async function parsePDF(base64Data: string): Promise<{ text: string }> {
  const buffer = Buffer.from(base64Data, "base64");
  const data = await pdf(buffer); // pdf-extraction return { text, numpages, info, metadata, version }
  return { text: data.text };
}
export async function extractTextFromImage(imageData: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Tesseract.recognize(Buffer.from(imageData, "base64"), "eng")
      .then(({ data: { text } }) => resolve(text))
      .catch(reject);
  });
}

export async function analyzeHoaxMessage(
  message: MediaMessage
): Promise<string | undefined> {
  let summary = "";

  if (message.hasMedia) {
    const media = await message.downloadMedia();
    switch (media.mimetype) {
      case "video/mp4":
      case "video/quicktime":
        summary = await parseVideo(media.data);
        break;
      case "image/jpeg":
      case "image/png":
        summary = await extractTextFromImage(media.data);
        break;
      case "application/pdf":
        try {
          summary = await parsePDF(media.data).then((res) => res.text);
          summary = "";
        } catch (err) {
          console.error("Gagal membaca PDF:", err);
          summary = "❌ File PDF tidak ditemukan atau gagal diproses.";
        }
        break;
      default:
        console.log("Unsupported media type");
        return;
    }
  } else if (message.body) {
    if (message.body.startsWith("http") || message.body.startsWith("https")) {
      summary = await getArticleContent(message.body);
    } else {
      summary = message.body;
    }
  }

  if (!summary) {
    console.log("No summary generated");
    return;
  }
  return summary;
}
