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
import { AI_AGENT, askingAI } from "./ai_agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function parseVideoToMP3toText(videoData: string): Promise<string[]> {
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

import { mediaCache } from '../utils/media_cache';

export async function analyzeHoaxMessage(message: any): Promise<any> {
  try {
    let media;
    const rawData = (message as any)._data || {};

    // Check if we have cached media passed in
    if ((message as any).cachedMedia) {
      console.log("Using provided cached media");
      media = (message as any).cachedMedia;
    } else {
      // Get media key from the message
      const messageMediaKey = rawData.mediaKey || rawData.quotedMsg?.mediaKey;
      if (messageMediaKey) {
        // Try to get from cache first
        const cachedMedia = mediaCache.get(messageMediaKey);
        if (cachedMedia) {
          console.log("Using cached media data");
          media = cachedMedia;
        } else {
          // If media not in cache but we have a key, try downloading
          console.log("Media not in cache, downloading...");
          media = await message.downloadMedia();
          if (media) {
            // Store in cache
            mediaCache.set(messageMediaKey, media);
            mediaCache.setMetadata({
              mediaKey: messageMediaKey,
              mimetype: media.mimetype,
              filename: media.filename,
              timestamp: Date.now()
            });
          }
        }
      } else if (message.hasMedia) {
        // No media key but message has media, try direct download
        console.log("No media key found, trying direct download...");
        media = await message.downloadMedia();
      }

      if (!media) {
        throw new Error("Failed to download media or media not found");
      }
    }

    // Store metadata and media in cache if we have media
    if (media) {
      const mediaKeyToUse = rawData.mediaKey || (media as any).mediaKey;
      if (mediaKeyToUse) {
        // Store metadata
        mediaCache.setMetadata({
          mediaKey: mediaKeyToUse,
          mimetype: media.mimetype,
          filename: media.filename,
          timestamp: Date.now()
        });

        // Store media content
        mediaCache.set(mediaKeyToUse, media);
      }
    }

    console.log("message", message);
    console.log("media", media);
    let summary = "";
    switch (media.mimetype) {
      case "video/mp4":
      case "video/quicktime":
        console.log("Processing video...");
        // Get timestamp from cache if available
        const mediaKeyToUse = rawData.mediaKey || (media as any).mediaKey;
        const metadata = mediaKeyToUse ? mediaCache.getMetadata(mediaKeyToUse) : null;
        const timestamp = metadata?.timestamp || Date.now();
        const videoDir = path.join(__dirname, "../assets/video");
        const videoPath = path.join(videoDir, `${timestamp}.mp4`);
        const framesDir = path.join(__dirname, "../assets/frames", `${timestamp}`);

        // Check if we already have processed this video
        if (fs.existsSync(videoPath) && fs.existsSync(framesDir)) {
          console.log("Using existing processed video assets...");
          const frameFiles = fs.readdirSync(framesDir)
            .filter(file => file.endsWith('.jpg'))
            .map(file => path.join(framesDir, file));

          let frameTexts = '';
          for (const framePath of frameFiles) {
            const frameBuffer = fs.readFileSync(framePath);
            const frameText = await extractTextFromImage(frameBuffer.toString('base64'));
            if (frameText.trim()) {
              frameTexts += frameText + '\n\n';
            }
          }
          summary = frameTexts;
          break;
        }

        // Save video file for frame extraction if needed
        if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
        if (!fs.existsSync(videoPath)) {
          fs.writeFileSync(videoPath, Buffer.from(media.data, "base64"));
        }

        const dataText = await parseVideoToMP3toText(media.data);
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

        // Check if content is related to news/hoax
        const isNewsRelated = await askingAI({
          input: allText,
          prompt: "Analyze if this content is related to news or claims that need fact-checking. Return only 'YES' if it's related to news/claims that need verification, or 'NO' if it's just casual conversation, entertainment, or unrelated content."
        });

        if (isNewsRelated.trim() === 'NO') {
          console.log("Content not related to news/hoax, extracting frames...");

          // Extract frames from video if not already done
          if (!fs.existsSync(framesDir)) {
            fs.mkdirSync(framesDir, { recursive: true });

            // Get video duration first
            const videoDuration = await new Promise<number>((resolve, reject) => {
              Ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) reject(err);
                resolve(metadata.format.duration || 0);
              });
            });

            // Calculate number of screenshots (one every 5 seconds)
            const screenshotCount = Math.max(1, Math.floor(videoDuration / 5));

            await new Promise<void>((resolve, reject) => {
              Ffmpeg(videoPath)
                .screenshots({
                  count: screenshotCount,
                timemarks: Array.from({ length: screenshotCount }, (_, i) => i * 5), // take screenshot every 5 seconds
                  folder: framesDir,
                  filename: 'frame-%i.jpg'
                })
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
            });
          }

          // Process each frame with OCR
          const frameFiles = fs.readdirSync(framesDir)
            .filter(file => file.endsWith('.jpg'))
            .map(file => path.join(framesDir, file));

          let frameTexts = '';
          for (const framePath of frameFiles) {
            const frameBuffer = fs.readFileSync(framePath);
            const frameText = await extractTextFromImage(frameBuffer.toString('base64'));
            if (frameText.trim()) {
              frameTexts += frameText + '\n\n';
            }
          }

          summary = frameTexts || allText;
        } else {
          summary = allText;
        }

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
    console.log("summary", summary);
    return (
      summary || "❌ Tidak ada konten yang dapat dianalisis dari media ini."
    );
  } catch (error) {
    console.error("Gagal membaca media:", error);
    return "❌ Gagal membaca media: ";
  }
}
