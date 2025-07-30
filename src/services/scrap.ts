import axios from "axios";
import { load } from "cheerio";

export async function getArticleContent(url: string): Promise<string> {
    try {
        const { data } = await axios.get(url);

        console.log(data)
        const $ = load(data);

        // Example selector: Kompas articles usually have content inside <div class="read__content">
        let content = $("div.read__content").text().trim();

        if (!content) {
            content = $("article").text().trim(); // Fallback for different page structures
        }

        return content || "No article content found.";
    } catch (error:any) {
        console.log(error?.response?.data)
        console.error("Error fetching article content:");
        return "Error fetching article content";
    }
}
