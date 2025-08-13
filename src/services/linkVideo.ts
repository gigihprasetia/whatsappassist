import fs from "node:fs/promises";
import path from "node:path";
import puppeteer, { Browser } from "puppeteer";
import axios from "axios";

interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function downloadTikTokVideo(
  url: string,
  outputDir: string = "./downloads",
  maxRetries: number = 3
): Promise<DownloadResult> {
  let browser: Browser | null = null;
  try {
    // Validasi URL
    if (!url || !url.includes("tiktok.com")) {
      throw new Error("URL TikTok tidak valid");
    }

    // Luncurkan browser
    browser = await puppeteer.launch({
      headless: "new" as any,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ],
      protocolTimeout: 3000,
    });
    const page = await browser.newPage();

    // Atur header tambahan
    await page.setExtraHTTPHeaders({
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      Referer: "https://ssstik.io/",
    });

    // Navigasi ke ssstik.io
    await page.goto("https://ssstik.io/id", {
      waitUntil: "domcontentloaded",
      timeout: 3000,
    });

    // Tunggu dan ketik URL ke input field
    const inputSelector = await page.evaluate(() => {
      const input =
        document.querySelector('input[name="main_page_input"]') ||
        document.querySelector('input[type="text"]') ||
        document.querySelector('input[placeholder*="Paste"]');
      return input
        ? input.getAttribute("name") || input.getAttribute("type") || "input"
        : null;
    });

    if (!inputSelector) {
      throw new Error("Tidak dapat menemukan field input di halaman");
    }

    await page.type(`input[name="${inputSelector}"], input[type="text"]`, url);

    // Klik tombol submit
    const submitSelector = await page.evaluate(() => {
      const button =
        document.querySelector("button#submit") ||
        document.querySelector('button[type="submit"]') ||
        document.querySelector('button[class*="submit"]') ||
        document.querySelector("button");
      return button
        ? button.getAttribute("id") || button.getAttribute("type") || "button"
        : null;
    });

    if (!submitSelector) {
      throw new Error("Tidak dapat menemukan tombol submit di halaman");
    }

    await page.click(
      `button#submit, button[type="submit"], button[class*="submit"]`
    );

    // Tunggu link download "Tanpa tanda air" muncul
    let downloadUrl: string | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await page.waitForSelector("a.without_watermark", { timeout: 60000 });
        downloadUrl = await page.evaluate(() => {
          const link = document.querySelector("a.without_watermark");
          return link ? link.getAttribute("href") : null;
        });
        if (downloadUrl) break;
      } catch {
        console.log(
          `Percobaan ${attempt + 1} gagal menemukan link, mencoba lagi...`
        );
        if (attempt === maxRetries)
          throw new Error("Waktu tunggu habis untuk menemukan link download");
        await new Promise((resolve) =>
          setTimeout(resolve, 5000 * (attempt + 1))
        );
      }
    }

    if (!downloadUrl) {
      throw new Error('Link "Tanpa tanda air" tidak ditemukan');
    }

    // Pastikan direktori output ada
    await fs.mkdir(outputDir, { recursive: true }).catch(() => {});

    // Unduh video
    const fileName = `tiktok_${Date.now()}.mp4`;
    const filePath = path.join(outputDir, fileName);

    const response = await axios({
      url: downloadUrl,
      method: "GET",
      responseType: "stream",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: "https://ssstik.io/",
      },
      timeout: 3000,
    });

    // Simpan video
    const writer = await fs.open(filePath, "w");
    const stream = response.data.pipe(await writer.createWriteStream());
    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
    await writer.close();

    await browser.close();
    return {
      success: true,
      filePath,
    };
  } catch (error) {
    if (browser) await browser.close();
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Terjadi error yang tidak diketahui",
    };
  }
}
