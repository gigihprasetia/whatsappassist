import OpenAI from "openai";
import {
  GOOGLE_CSE_ID,
  GOOGLE_SEARCH_API_KEY,
  OPEN_API_KEY,
} from "../utils/env";
import { ResponseAI } from "../types";
import { promptData } from "../utils/prompt";
import axios from "axios";
import { wa_client } from "./wa_client";

const FACT_CHECK_SITES = [
  "*.komdigi.go.id",
  "*.kompas.com",
  "*.kompas.tv",
  "*.kompas.co.id",
  "*.kompas.id",
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
      temperature: 1,
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
        .replace(/@\d+/g, "") // Remove phone numbers/mentions
        .replace(/sairing/gi, "") // Remove trigger word
        .replace(/[^\w\s]/g, " ") // Replace special chars with space
        .replace(/\s+/g, " ") // Normalize spaces
        .trim();
      console.log("Clean query:", cleanSummary);
      const query = `${cleanSummary}`;

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
              siteSearch: site,
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

      // console.log(response);

      if (response.data.items?.length) {
        console.log("found articles from", site, response.data.items?.length);
        allArticles = allArticles.concat(response.data.items).slice(0, 5);
      } else {
        console.log("no articles found from", site);
      }
    }

    if (!allArticles.length) {
      return {
        summerize:
          "Waduh, maaf. Saya belum bisa mengerti hal yang kamu tanyakan, apakah boleh ketik kesimpulan dari hal tersebut?",
        source: [],
      };
    } else {
      // Gabungkan ringkasan dan sumber
      allArticles.forEach((item, idx) => {
        // Clean up the title by removing common fact-checking tags
        const cleanTitle = item.title
          .replace(/\[HOAKS\]/gi, "")
          .replace(/\[DISINFORMASI\]/gi, "")
          .replace(/\[FAKTA\]/gi, "")
          .replace(/\[CEK FAKTA\]/gi, "")
          .replace(/\[SALAH\]/gi, "")
          .replace(/\[BENAR\]/gi, "")
          .replace(/\[\s*[^\]]*\s*\]/g, "") // Remove any remaining bracketed text
          .replace(/\s+/g, " ")
          .trim();
        articleSummaries += `Info ${idx + 1}: ${cleanTitle}\n${item.snippet}\n`;
        sourcesList += `${idx + 1}. ${item.link}\n`;
      });

      // Get the original query for the prompt
      const queryForPrompt = summary
        .replace(/@\d+/g, "") // Remove phone numbers/mentions
        .replace(/sairing/gi, "") // Remove trigger word
        .replace(/[^\w\s]/g, " ") // Replace special chars with space
        .replace(/\s+/g, " ") // Normalize spaces
        .trim();

      const aiPrompt = `
Kamu adalah AI hoax detector, dan telah menemukan beberapa informasi dari website terpercaya. 
ini adalah ringkasan informasinya ${articleSummaries}
ini adalah sumber informasinya ${sourcesList}
- cek informasi dari pengguna apakah hoax atau bukan. kalau tidak benar kesimpulannya adalah HOAX, kalau benar berarti TIDAK HOAX
- Apakah ini hoax atau bukan?
- Apa alasannya?
- tulislah sumber informasinya dan link berita nya nya
- kalau tidak ada informasinya, jawab sebisanya
- Gunakan bahasa yang casual
- di akhir kasih kesimpulan singkat: HOAX atau TIDAK HOAX
- gunakan emoji, bold text yang penting, italic untuk bahasa asing, untuk format whatsapp message
    `.trim();
      const aiAnalysis = await askingAI({
        input: `"${queryForPrompt}" Apakah merupakan HOAX atau TIDAK HOAX? Berikan penjelasan ringkas`,
        prompt: aiPrompt,
      });

      return { summerize: aiAnalysis, source: allArticles };
    }
  } catch (error: any) {
    console.error(
      "Gagal menganalisis dengan AI:",
      error.response?.data || error.message
    );
    throw error;
  }
}
