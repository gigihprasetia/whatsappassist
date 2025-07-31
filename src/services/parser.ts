import fs from "fs";
import { exec } from "child_process";
import { Buffer } from "buffer";
import Tesseract from "tesseract.js";
import Ffmpeg from "fluent-ffmpeg";

import { getArticleContent } from "./scrap";
// @ts-ignore
import pdf from "pdf-extraction";
import path from "path";
import { fileURLToPath } from "url";
import { AI_AGENT } from "./ai_agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function parseVideo(videoData: string): Promise<string[]> {
  const timestamp = Date.now();
  const videoDir = path.join(__dirname, "../assets/video");
  const audioDir = path.join(__dirname, "../assets/audio");
  const outputDir = path.join(audioDir, `${timestamp}_segments`);

  // Buat folder jika belum ada
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const videoPath = path.join(videoDir, `${timestamp}.mp4`);
  const audioPath = path.join(audioDir, `${timestamp}.mp3`);

  // Simpan video
  fs.writeFileSync(videoPath, Buffer.from(videoData, "base64"));

  // Convert video ke mp3
  await new Promise<void>((resolve, reject) => {
    Ffmpeg(videoPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(128)
      .save(audioPath)
      .on("end", () => {
        console.log("✅ Konversi ke MP3 selesai");
        resolve();
      })
      .on("error", (err) => {
        console.error("❌ Error konversi MP3:", err.message);
        reject(err);
      });
  });

  // Split mp3 jadi potongan-potongan
  return new Promise((resolve, reject) => {
    const segmentDurationSec = 60;
    const outputPattern = path.join(outputDir, `output_%03d.mp3`);

    Ffmpeg(audioPath)
      .audioBitrate(128)
      .format("mp3")
      .outputOptions([
        `-f segment`,
        `-segment_time ${segmentDurationSec}`,
        `-reset_timestamps 1`,
      ])
      .on("end", () => {
        console.log("✅ Split dan konversi selesai");
        const files = fs
          .readdirSync(outputDir)
          .filter((file) => file.endsWith(".mp3"))
          .map((file) => path.join(outputDir, file))
          .sort();
        resolve(files);
      })
      .on("error", (err) => {
        console.error("❌ Error saat split/konversi:", err.message);
        reject(err);
      })
      .save(outputPattern);
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

export async function analyzeHoaxMessage(message: any): Promise<any> {
  try {
    const media = await message.downloadMedia();

    let summary = "";
    switch (media.mimetype) {
      case "video/mp4":
      case "video/quicktime":
        console.log("Processing video...");
        const dataText = await parseVideo(media.data);

        let allText = "";

        for (const filePath of dataText) {
          console.log("🔊 Transcribing:", filePath);
          const result = await AI_AGENT.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "gpt-4o-transcribe",
            response_format: "text",
          });

          allText += result + "\n\n";
        }
        summary = allText;

        break;
      case "image/jpeg":
      case "image/png":
        console.log("Processing image...");
        summary = await extractTextFromImage(media.data);
        break;
      case "application/pdf":
        console.log("Processing PDF...");
        try {
          summary = await parsePDF(media.data).then((res) => res.text);
        } catch (err) {
          console.error("Gagal membaca PDF:", err);
          summary = "❌ File PDF tidak ditemukan atau gagal diproses.";
        }
        break;
      default:
        console.log("Unsupported media type:", media.mimetype);
        return "❌ Tipe media tidak didukung: " + media.mimetype;
    }

    return (
      summary || "❌ Tidak ada konten yang dapat dianalisis dari media ini."
    );
  } catch (error) {
    console.error("Gagal membaca media:", error);
    return "❌ Gagal membaca media: ";
  }
}
