import axios from "axios";
import { load } from "cheerio";
import puppeteer from "puppeteer";
import * as cheerio from "cheerio";

export async function getArticleContent(url: string): Promise<string> {
  try {
    const { data } = await axios.get(url);

    console.log(data);
    const $ = load(data);

    // Example selector: Kompas articles usually have content inside <div class="read__content">
    let content = $("div.read__content").text().trim();

    if (!content) {
      content = $("article").text().trim(); // Fallback for different page structures
    }

    return content || "No article content found.";
  } catch (error: any) {
    console.log(error?.response?.data);
    console.error("Error fetching article content:");
    return "Error fetching article content";
  }
}

export const getArticle = async (url: string) => {
  try {
    console.log("Getting article:", url);

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1");

    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);

    const title = $("h1").text().trim();
    const author = $(".author-name").text().trim();

    // Coba beberapa selector untuk isi artikel

    // console.log(html);

    let content =
      $(".read-content").text().trim() ||
      $("article").text().trim() ||
      $("div[itemprop='articleBody']").text().trim();

    return {
      title: title || "",
      author: author || "",
      content: content || "",
    };
  } catch (err) {
    console.error("❌ Error getArticle:", err);
    throw new Error("Failed to fetch article");
  }
};
