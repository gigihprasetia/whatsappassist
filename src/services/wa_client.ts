import WhatsAppWebJS from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { askingAI, searchArticleWithGoogleAndAI } from "./ai_agent";
import { analyzeHoaxMessage } from "./parser";
import { promptData } from "../utils/prompt";
import { getArticle, getArticleContent } from "./scrap";

const { Client, LocalAuth } = WhatsAppWebJS;

const wa_client = new Client({
  authStrategy: new LocalAuth({
    clientId: "client-two",
  }),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // Prevent permission issues
    timeout: 12000, // Increase timeout to 60 seconds
  },
});

wa_client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

wa_client.on("ready", () => {
  console.log("WhatsApp bot siap!");
});

// Get our own number when client is ready
let ownNumber: string;
wa_client.on("ready", async () => {
  const info = await wa_client.info;
  ownNumber = info.wid._serialized;
  console.log("Bot ready with number:", ownNumber);
});

// for self response and mentions
wa_client.on("message_create", async (msg) => {
  const { body, fromMe, from, hasMedia, mentionedIds } = msg;

  // Check if message is a mention to us or includes the trigger word
  const isMentioned = mentionedIds?.includes(ownNumber);
  const hasKeyword = body.toLowerCase().includes("sairing");
  const isForwarded = msg.isForwarded;
  const isTanya = isMentioned || hasKeyword || isForwarded;
  
  let summary = "";
  if (isTanya) {
    let rawQuery = "";
    let messageToAnalyze = msg;

    // Check if this is a reply to another message
    if (isMentioned && msg.hasQuotedMsg) {
      try {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg) {
          // Use quoted message for analysis
          messageToAnalyze = quotedMsg;
          // Use both messages for context
          rawQuery = quotedMsg.body + "\n" + body;
        }
      } catch (err) {
        console.error("Error getting quoted message:", err);
      }
    }

    // If no quoted message or failed to get it, use original message
    if (!rawQuery) {
      rawQuery = body;
    }

    // Clean up the query
    rawQuery = rawQuery
      .replace(/@\d+/g, "") // Remove any mentions
      .replace(/sairing/gi, "") // Remove trigger word (case insensitive)
      .trim();

    msg.reply("Baik kami akan memeriksa artikel tersebut, sebentar yaa..");

    try {
      // Import mediaCache
      const { mediaCache } = await import('../utils/media_cache');

      // Analyze message media
      console.log("messageToAnalyze", messageToAnalyze);

      // Access raw message data safely
      const rawData = messageToAnalyze as any;
      let mediaKey;
      
      // Check if this is a quoted message with media
      if (rawData._data?.quotedMsg) {
        // For quoted messages, media key is in quotedMsg
        mediaKey = rawData._data.quotedMsg.mediaKey;
        console.log("Using quoted message media key:", mediaKey);
      } else if (rawData._data) {
        // For direct messages, media key is in _data
        mediaKey = rawData._data.mediaKey;
        console.log("Using direct message media key:", mediaKey);
      }

      let response = "";
      
      // Try to analyze the message
      try {
        response = await analyzeHoaxMessage(messageToAnalyze) || "";
      } catch (error) {
        console.error("Error analyzing message:", error);
        msg.reply("Maaf, terjadi kesalahan saat menganalisis media");
        return;
      }

      if (response) {
        const querySummary = await askingAI({
          input: response || "",
          prompt: promptData.getHeadline,
        });
        const getHoax = await askingAI({
          input: response || "",
          prompt: promptData.checkHoax,
        });

        // wa_client.sendMessage(from, `memulai context pertanyaan`);
        // wa_client.sendMessage(from, `${querySummary} sairing`);
        // summary = querySummary;
        wa_client.sendMessage(from, getHoax);

        // const hoaxCheckFromKompas = await searchArticleWithGoogleAndAI(
        //   querySummary
        // );

        // console.log("menanyakan", querySummary);

        // wa_client.sendMessage(from, hoaxCheckFromKompas.summerize);
        // hoaxCheckFromKompas?.source?.forEach((source: any) => {
        //   wa_client.sendMessage(from, source.link);
        // });
      }
      if (rawQuery.startsWith("https") || rawQuery.startsWith("http")) {
        // const summary = await getArticleContent(rawQuery);
        const summary = await getArticle(rawQuery);

        if (!summary.title && !summary.content) {
          wa_client.sendMessage(from, `title artikel tidak ditemukan`);
          return;
        }

        const getClearContent = await askingAI({
          input: `ambil bagan content nya ${summary.content}`,
        });

        const result = await askingAI({
          input: `title : ${summary.title}, content:${getClearContent}`,
          prompt: promptData.checkHoax,
        });

        wa_client.sendMessage(from, result);
      } else {
        const query = rawQuery;
        const hoaxCheckFromKompas = await searchArticleWithGoogleAndAI(query);
        wa_client.sendMessage(from, hoaxCheckFromKompas.summerize);
        // hoaxCheckFromKompas?.source?.forEach((source: any) => {
        //   wa_client.sendMessage(from, source.link);
        // });
      }

    } catch (err) {
      console.log(err);
      wa_client.sendMessage(
        from,
        "Maaf terjadi kesalahan, mohon ulangi kembali"
      );
    }
  }
});

// for another users
// wa_client.on("message", async (msg) => {
//   const { body, fromMe } = msg;

//   const isBales = body.includes("--tanya");
//   if (isBales) {
//     const ask = await askingAI({ input: body });

//     msg.reply(ask);
//   }
// });

export default wa_client;
