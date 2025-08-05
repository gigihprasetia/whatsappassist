import OpenAI from "openai";
import {
  GOOGLE_CSE_ID,
  GOOGLE_SEARCH_API_KEY,
  OPEN_API_KEY,
} from "../utils/env";
import { ResponseAI } from "../types";
import { promptData } from "../utils/prompt";
import axios from "axios";
import wa_client from "./wa_client";

const FACT_CHECK_SITES = [
  "komdigi.go.id",
  "kompas.com",
  "kominfo.go.id",
  "news.detik.com",
  "liputan6.com",
];

export const AI_AGENT = new OpenAI({
  apiKey: OPEN_API_KEY,
});

export const askingAI = async ({
  input,
  prompt = "",
}: {
  input: string;
  prompt?: string;
}): Promise<string> => {
  try {
    const response = await AI_AGENT.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: input,
        },
      ],
      temperature: 0.2,
    });

    const content = response.choices[0].message?.content || "";

    return content;
  } catch (err) {
    console.error("❌ Error:", err);
    throw new Error("error asking ai");
  }
};

export async function searchArticleWithGoogleAndAI(
  summary: string
): Promise<{ summerize: string; source: any[] }> {
  try {
    let allArticles: any[] = [];
    let sourcesList = "";
    let articleSummaries = "";

    for (const site of FACT_CHECK_SITES) {
      // Clean up mentions, phone numbers and other unnecessary text
      const cleanSummary = summary
        .replace(/@\d+/g, '') // Remove phone numbers/mentions
        .replace(/sairing/gi, '') // Remove trigger word
        .replace(/[^\w\s]/g, ' ') // Replace special chars with space
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
      console.log('Clean query:', cleanSummary);
      const query = `${cleanSummary} site:${site}`;

      // const query = `${summary}`;

      console.log(`mencari query ::: ${query}`);
      let response;
      try {
        response = await axios.get(
          "https://www.googleapis.com/customsearch/v1",
          {
            params: {
              key: GOOGLE_SEARCH_API_KEY,
              cx: GOOGLE_CSE_ID,
              q: query,
            },
          }
        );
      } catch (error) {
        console.error("❌ Error:", error);
        response = {
          data: {
            items: [],
          },
        };
      }

      console.log(response.data.items?.length, "items");
      console.log(response.data.items, "items");

      if (response.data.items?.length) {
        allArticles = allArticles.concat(response.data.items).slice(0, 5);
      }
    }

    if (!allArticles.length) {
      return {
        summerize:
          "Tidak ditemukan artikel terkait dari situs pemeriksa fakta.",
        source: [],
      };
    }

    // Gabungkan ringkasan dan sumber
    allArticles.forEach((item, idx) => {
      // Clean up the title by removing common fact-checking tags
      const cleanTitle = item.title
        .replace(/\[HOAKS\]/gi, '')
        .replace(/\[DISINFORMASI\]/gi, '')
        .replace(/\[FAKTA\]/gi, '')
        .replace(/\[CEK FAKTA\]/gi, '')
        .replace(/\[SALAH\]/gi, '')
        .replace(/\[BENAR\]/gi, '')
        .replace(/\[\s*[^\]]*\s*\]/g, '') // Remove any remaining bracketed text
        .replace(/\s+/g, ' ')
        .trim();
      articleSummaries += `Artikel ${idx + 1}: ${cleanTitle}\n${item.snippet}\n\n`;
      sourcesList += `${idx + 1}. ${item.link}\n`;
    });

    // Get the original query for the prompt
    const queryForPrompt = summary
      .replace(/@\d+/g, '') // Remove phone numbers/mentions
      .replace(/sairing/gi, '') // Remove trigger word
      .replace(/[^\w\s]/g, ' ') // Replace special chars with space
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();

    const aiPrompt = `
Berikut adalah hasil pencarian dari beberapa situs pemeriksa fakta terpercaya.

${articleSummaries}

Sumber:
${sourcesList}

🔍 Analisis: Apakah "${queryForPrompt}" merupakan HOAX atau TIDAK HOAX berdasarkan informasi yang tersedia? Berikan penjelasan ringkas dan tulis di akhir:

KESIMPULAN: HOAX / TIDAK HOAX.
    `.trim();

    const aiAnalysis = await askingAI({ input: aiPrompt });
    return { summerize: aiAnalysis, source: allArticles };
  } catch (error: any) {
    console.error(
      "Gagal mencari artikel atau menganalisis dengan AI:",
      error.response?.data || error.message
    );
    throw error;
  }
}
