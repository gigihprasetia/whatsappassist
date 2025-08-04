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
wa_client.on("message", async (msg) => {
  const { body, fromMe, from, hasMedia, mentionedIds } = msg;

  // Skip messages sent by us to prevent duplicate handling
  if (fromMe) return;

  // Check if message is a mention to us or includes the trigger word
  const isMentioned = mentionedIds?.includes(ownNumber);
  const hasKeyword = body.toLowerCase().includes("sairing");
  const isForwarded = msg.isForwarded;
  const isAsking = isMentioned || hasKeyword || isForwarded;
  console.log("Message received:", { isForwarded, isMentioned, hasKeyword });
  let summary = "";
  if(isAsking){
    let rawQuery = "";
    let messageToAnalyze = msg;
    
    // Check if this is a reply to another message
    if (msg.hasQuotedMsg) {
      try {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg) {
          // Use quoted message for analysis
          messageToAnalyze = quotedMsg;
          
          msg.reply("Baik kami akan memeriksa artikel tersebut, sebentar yaa..");
          
          try {
            let response = "";
            
            // Check for media in quoted message first
            if (quotedMsg.hasMedia) {
              console.log("quotedMsg", quotedMsg);
              const summary = await analyzeHoaxMessage(quotedMsg) || "";
              console.log("summary", summary);
              response = await askingAI({
                input: summary,
                prompt: promptData.checkHoax,
              });
              console.log("response with media", response);
            } else {
              // Use text content for analysis
              rawQuery = quotedMsg.body;
              if (rawQuery.startsWith("https") || rawQuery.startsWith("http")) {
                const summary = await getArticle(rawQuery);
                if (!summary.title && !summary.content) {
                  msg.reply("title artikel tidak ditemukan");
                  return;
                }
                const getClearContent = await askingAI({
                  input: `ambil bagan content nya ${summary.content}`,
                });
                response = await askingAI({
                  input: `title : ${summary.title}, content:${getClearContent}`,
                  prompt: promptData.checkHoax,
                });
              } else {
                const hoaxCheckFromKompas = await searchArticleWithGoogleAndAI(rawQuery);
                response = hoaxCheckFromKompas.summerize;
              }
            }
            
            if (response) {
              wa_client.sendMessage(from, response);
            }
          } catch (error) {
            console.error("Error analyzing message:", error);
            msg.reply("Maaf, terjadi kesalahan saat menganalisis konten");
          }
        }
      } catch (err) {
        console.error("Error getting quoted message:", err);
      }
    } else {
      // Direct message or forwarded message
      msg.reply("Baik kami akan memeriksa artikel tersebut, sebentar yaa..");
      
      try {
        let response = "";
        
        // Check for media in original message
        if (messageToAnalyze.hasMedia) {
          const summary = await analyzeHoaxMessage(messageToAnalyze) || "";
          response = await askingAI({
            input: summary,
            prompt: promptData.checkHoax,
          });
        } else {
          // Use text content for analysis
          rawQuery = body;
          if (rawQuery.startsWith("https") || rawQuery.startsWith("http")) {
            const summary = await getArticle(rawQuery);
            if (!summary.title && !summary.content) {
              msg.reply("title artikel tidak ditemukan");
              return;
            }
            const getClearContent = await askingAI({
              input: `ambil bagan content nya ${summary.content}`,
            });
            response = await askingAI({
              input: `title : ${summary.title}, content:${getClearContent}`,
              prompt: promptData.checkHoax,
            });
          } else {
            const hoaxCheckFromKompas = await searchArticleWithGoogleAndAI(rawQuery);
            response = hoaxCheckFromKompas.summerize;
          }
        }
        
        if (response) {
          wa_client.sendMessage(from, response);
        }
      } catch (error) {
        console.error("Error analyzing message:", error);
        msg.reply("Maaf, terjadi kesalahan saat menganalisis konten");
      }
    }
  }
  // if (isAsking) {
  //   let rawQuery = "";
  //   let messageToAnalyze = msg;


  //     // Access raw message data safely
  //     const rawData = messageToAnalyze as any;
  //     let mediaKey;
      
  //     // Check if this is a quoted message with media
  //     if (rawData._data?.quotedMsg.hasMedia) {
  //       // For quoted messages, media key is in quotedMsg
  //       mediaKey = rawData._data.quotedMsg.mediaKey;
  //       console.log("Using quoted message media key:", mediaKey);
  //     } else if (rawData._data && rawData._data.hasMedia) {
  //       // For direct messages, media key is in _data
  //       mediaKey = rawData._data.mediaKey;
  //       console.log("Using direct message media key:", mediaKey);
  //     }

  //     let response = "";
      
  //     // Try to analyze the message
  //     try {
  //       response = await analyzeHoaxMessage(messageToAnalyze) || "";
  //     } catch (error) {
  //       console.error("Error analyzing message:", error);
  //       msg.reply("Maaf, terjadi kesalahan saat menganalisis media");
  //       return;
  //     }

  //     if (response) {
  //       // const querySummary = await askingAI({
  //       //   input: response || "",
  //       //   prompt: promptData.getHeadline,
  //       // });
  //       const getHoax = await askingAI({
  //         input: response || "",
  //         prompt: promptData.checkHoax,
  //       });

  //       // wa_client.sendMessage(from, `memulai context pertanyaan`);
  //       // wa_client.sendMessage(from, `${querySummary} sairing`);
  //       // summary = querySummary;
  //       wa_client.sendMessage(from, getHoax);

  //       // const hoaxCheckFromKompas = await searchArticleWithGoogleAndAI(
  //       //   querySummary
  //       // );

  //       // console.log("menanyakan", querySummary);

  //       // wa_client.sendMessage(from, hoaxCheckFromKompas.summerize);
  //       // hoaxCheckFromKompas?.source?.forEach((source: any) => {
  //       //   wa_client.sendMessage(from, source.link);
  //       // });
  //     }
  //     if (rawQuery.startsWith("https") || rawQuery.startsWith("http")) {
  //       // const summary = await getArticleContent(rawQuery);
  //       const summary = await getArticle(rawQuery);

  //       if (!summary.title && !summary.content) {
  //         wa_client.sendMessage(from, `title artikel tidak ditemukan`);
  //         return;
  //       }

  //       const getClearContent = await askingAI({
  //         input: `ambil bagan content nya ${summary.content}`,
  //       });

  //       const result = await askingAI({
  //         input: `title : ${summary.title}, content:${getClearContent}`,
  //         prompt: promptData.checkHoax,
  //       });

  //       wa_client.sendMessage(from, result);
  //     } else {
  //       const query = rawQuery;
  //       const hoaxCheckFromKompas = await searchArticleWithGoogleAndAI(query);
  //       wa_client.sendMessage(from, hoaxCheckFromKompas.summerize);
  //       // hoaxCheckFromKompas?.source?.forEach((source: any) => {
  //       //   wa_client.sendMessage(from, source.link);
  //       // });
  //     }

  //   } catch (err) {
  //     console.log(err);
  //     wa_client.sendMessage(
  //       from,
  //       "Maaf terjadi kesalahan, mohon ulangi kembali"
  //     );
  //   }
  // }
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
