import WhatsAppWebJS from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { askingAI, searchArticleWithGoogleAndAI } from "./ai_agent";
import { linkTiktokMessage, parseMessage } from "./parser";
import { promptData } from "../utils/prompt";
import { getArticle, getArticleContent } from "./scrap";
import { mediaCache } from "../utils/media_cache";
import QRCode from "qrcode";
import { wss } from "../main";
import { downloadTikTokVideo } from "./linkVideo";

async function analyzeMediaMessage(message: any): Promise<string> {
  try {
    // Get media content summary
    const { summary, frameFiles, frameTexts, mediaKey } = (await parseMessage(
      message
    )) || { summary: "", frameFiles: [], frameTexts: "", mediaKey: undefined };

    console.log("message", message);
    console.log("summary", summary);

    const googleSearchQuery = await askingAI({
      prompt: promptData.getHeadline,
      input: summary,
    });
    const pointers = await askingAI({
      prompt: promptData.getPointers,
      input: summary,
    });
    console.log("query", googleSearchQuery);
    let hoaxCheck = "";
    // Search for articles and analyze with AI
    const hoaxCheckFromGoogle = await searchArticleWithGoogleAndAI(
      googleSearchQuery
    );
    if (hoaxCheckFromGoogle.source.length > 0) {
      hoaxCheck = hoaxCheckFromGoogle.summerize;
    } else {
      const hoaxCheckFromAI = await askingAI({
        prompt: promptData.checkHoaxWithoutArticles,
        input: summary,
      });
      hoaxCheck = hoaxCheckFromAI;
    }
    // Cache frames and OCR results only after successful processing
    if (
      mediaKey &&
      frameFiles.length > 0 &&
      hoaxCheckFromGoogle.source.length > 0
    ) {
      console.log("✅ Caching video frames");
      mediaCache.set(`${mediaKey}_frames`, frameFiles);
      mediaCache.setMetadata({
        mediaKey: `${mediaKey}_frames`,
        mimetype: "image/jpeg",
        timestamp: Date.now(),
      });

      if (frameTexts) {
        console.log("✅ Caching OCR results");
        mediaCache.set(`${mediaKey}_ocr_results`, frameTexts);
        mediaCache.setMetadata({
          mediaKey: `${mediaKey}_ocr_results`,
          mimetype: "text/plain",
          timestamp: Date.now(),
        });
      }
    }

    return hoaxCheck;
  } catch (error) {
    console.error("Error processing media message:", error);
    throw error;
  }
}

const { Client, LocalAuth } = WhatsAppWebJS;

// Maximum number of retries for initialization
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

export const wa_client = new Client({
  authStrategy: new LocalAuth({
    clientId: "client-two",
  }),
  puppeteer: {
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-zygote",
      "--deterministic-fetch",
      "--disable-features=IsolateOrigins",
      "--disable-site-isolation-trials",
    ],
    timeout: 60000, // Increase timeout to 60 seconds
    headless: true,
  },
});

export let current_qr: any;
export let isLogin = false;

// Initialize function with retry logic
async function initializeWithRetry(retries = MAX_RETRIES): Promise<void> {
  try {
    await wa_client.initialize();
  } catch (error: any) {
    console.error(`WhatsApp initialization error: ${error.message}`);

    if (retries > 0) {
      console.log(
        `Retrying initialization in ${
          RETRY_DELAY / 1000
        } seconds... (${retries} attempts remaining)`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return initializeWithRetry(retries - 1);
    } else {
      console.error(
        "Max retries reached. Could not initialize WhatsApp client."
      );
      throw error;
    }
  }
}

wa_client.on("qr", async (qr) => {
  isLogin = false; // Tandai bahwa bot belum login
  qrcode.generate(qr, { small: true }); // Tampilkan QR di terminal
  try {
    current_qr = await QRCode.toDataURL(qr); // Konversi QR ke Data URL
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ qr: current_qr, isLogin }));
      }
    });
  } catch (error) {
    console.error("Error generating QR Data URL:", error);
    current_qr = undefined; // Pastikan nilai tetap aman jika gagal
  }
});

// Get our own number when client is ready
let ownNumber: string;
wa_client.on("ready", async () => {
  isLogin = true;
  const info = await wa_client.info;
  console.log("WhatsApp bot siap!");
  ownNumber = info.wid._serialized;
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ isLogin }));
    }
  });
  console.log("Bot ready with number:", ownNumber);
});

wa_client.on("auth_failure", (msg) => {
  isLogin = false;
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ qr: undefined, isLogin }));
    }
  });
  console.error("Authentication failed:", msg);
});

wa_client.on("disconnected", async (reason) => {
  isLogin = false;
  console.log("Client disconnected. Reason:", reason);
  if (reason === "LOGOUT") {
    console.log("Attempting to clean up session...");

    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ qr: undefined, isLogin }));
      }
    });

    try {
      await wa_client.destroy(); // Tutup instance Puppeteer
      console.log("Client destroyed, waiting for file release...");
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Tunggu 2 detik untuk melepaskan kunci file
      initializeWithRetry(); // Coba inisialisasi ulang
    } catch (err) {
      console.error("Error during cleanup:", err);
    }
  } else {
    initializeWithRetry();
  }
});

// for self response and mentions
wa_client.on("message", async (msg) => {
  const { body, fromMe, from, hasMedia } = msg;

  // Skip messages sent by us to prevent duplicate handling
  if (fromMe) return;

  // Initialize variables for checks
  let isMentioned = false;
  const hasKeyword = body.toLowerCase().includes("sairing");
  const isForwarded = msg.isForwarded;

  // Check for mentions in group chats
  if (from.endsWith("@g.us")) {
    try {
      const mentionedContacts = await msg.getMentions();
      const info = await wa_client.info;
      isMentioned = mentionedContacts.some(
        (contact) => contact.id._serialized === info.wid._serialized
      );
    } catch (error) {
      console.error("Error checking mentions:", error);
    }
  }

  const isAsking = isMentioned || hasKeyword || isForwarded;
  console.log("Message received:", { isForwarded, isMentioned, hasKeyword });
  let summary = "";
  const greetingWords = [
    "halo",
    "hi",
    "hello",
    "hay",
    "hei",
    "hey",
    "assalamualaikum",
    "asalamualaikum",
    "assalamualaikum",
    "asalamualaikum",
    "assalam",
    "asalam",
    "salam",
    "slm",
    "aslm",
    "asw",
    "asm",
    "assalamualaikum wr wb",
    "asalamualaikum wr wb",
    "assalamu alaikum",
    "asalamu alaikum",
    "aslmkm",
    "asslmklm",
    "p",
    "pagi",
    "siang",
    "sore",
    "malam",
  ];
  const isGreeting =
    greetingWords.some((word) => msg.body.startsWith(word)) &&
    msg.body.includes("sairing");

  if (isGreeting) {
    console.log("👋 Greeting detected, sending intro message");
    msg.reply(introMessage);
    return;
  }
  if (isAsking) {
    let rawQuery = "";
    let messageToAnalyze = msg;

    // Check if this is a reply to another message
    if (msg.hasQuotedMsg) {
      try {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg) {
          // Use quoted message for analysis
          messageToAnalyze = quotedMsg;

          msg.reply("Oke, kami cek sebentar ya..");

          try {
            let response = "";

            // Check for media in quoted message first
            if (quotedMsg.hasMedia) {
              console.log("Processing quoted message with media 180");
              const messageContext = quotedMsg.body.replace("sairing", "")
                ? `Konteks pesan: ${quotedMsg.body}\n\n`
                : "";
              response = await analyzeMediaMessage(quotedMsg);
              // if (messageContext) {
              //   console.log("Adding message context to media analysis");
              //   response = messageContext + response;
              // }
            } else {
              // Use text content for analysis
              rawQuery = quotedMsg.body.replace("sairing", "");
              if (rawQuery.startsWith("https") || rawQuery.startsWith("http")) {
                const summary = await getArticle(rawQuery);
                if (!summary.title && !summary.content) {
                  msg.reply("title berita tidak ditemukan");
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
                const hoaxCheckFromGoogle = await searchArticleWithGoogleAndAI(
                  rawQuery
                );
                response = hoaxCheckFromGoogle.summerize;
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
      msg.reply("Oke, kami cek sebentar ya..");

      try {
        let response = "";

        // Check for media in original message
        if (messageToAnalyze.hasMedia) {
          console.log("Processing direct message with media");
          const messageContext = messageToAnalyze.body.replace("sairing", "")
            ? `Konteks pesan: ${messageToAnalyze.body}\n\n`
            : "";
          response = await analyzeMediaMessage(messageToAnalyze);
          if (messageContext) {
            console.log("Adding message context to media analysis");
            response = messageContext + response;
          }
        } else {
          // Use text content for analysis
          rawQuery = body;
          if (rawQuery.startsWith("https") || rawQuery.startsWith("http")) {
            if (rawQuery.includes("tiktok.com")) {
              const text = await linkTiktokMessage(rawQuery);

              const googleSearchQuery = await askingAI({
                prompt: promptData.getHeadline,
                input: text,
              });

              let hoaxCheck = "";
              // Search for articles and analyze with AI
              const hoaxCheckFromGoogle = await searchArticleWithGoogleAndAI(
                googleSearchQuery
              );
              if (hoaxCheckFromGoogle.source.length > 0) {
                hoaxCheck = hoaxCheckFromGoogle.summerize;
              } else {
                const hoaxCheckFromAI = await askingAI({
                  prompt: promptData.checkHoaxWithoutArticles,
                  input: googleSearchQuery,
                });
                hoaxCheck = hoaxCheckFromAI;
              }

              response = hoaxCheck;
            } else {
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
            }
          } else {
            const hoaxCheckFromGoogle = await searchArticleWithGoogleAndAI(
              rawQuery
            );
            response = hoaxCheckFromGoogle.summerize;
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
});

// Introduction message template
const introMessage = `👋 Halo, perkenalkan saya *sAIring*, teman AI kamu yang bisa menyaring setiap pernyataan, artikel, video, dan gambar yang ingin kamu tanyakan kebenarannya.

📱 Cara menggunakan:
1. Kirim pesan dengan awalan "sairing" diikuti informasi yang ingin dicek
2. Kirim gambar atau video dengan caption atau mention "sairing"
3. Reply/balas pesan yang ingin dicek dan tambahkan kata "sairing"
4. Forward/teruskan pesan yang ingin dicek dan tambahkan kata "sairing"

✨ Contoh:
sairing apakah benar ada bantuan dana dari pemerintah?

🤖 Saya akan membantu mengecek informasi dari sumber-sumber terpercaya dan memberikan hasil analisisnya kepada Anda.

*Mari sAIring sebelum sharing!*`;

// Import group cache utilities
import { isKnownGroup, addKnownGroup } from "../utils/group_cache";

// Listen for group messages and handle first-time interactions
wa_client.on("message", async (message) => {
  if (message.from.endsWith("@g.us")) {
    const chat = await message.getChat();

    console.log("👥 Checking group:", chat.id._serialized);
    if (!isKnownGroup(chat.id._serialized)) {
      console.log("✨ New group detected, sending intro message");
      addKnownGroup(chat.id._serialized);
      chat.sendMessage(introMessage);
    } else {
      console.log("ℹ️ Group already known, skipping intro");
    }
  }
});

// Handle greetings and first messages in chats
wa_client.on("message", async (msg) => {
  const chat = await msg.getChat();
  const messageBody = msg.body.toLowerCase().trim();

  // Check for greeting variations

  // Handle first message in private chats
  if (!chat.isGroup) {
    console.log("📱 Private chat detected");
    const chatMessages = await chat.fetchMessages({ limit: 2 }); // Fetch 2 messages to check if this is first
    console.log("📨 Number of messages in chat:", chatMessages.length);

    if (chatMessages.length === 1) {
      console.log("✨ First message in private chat, sending intro");
      chat.sendMessage(introMessage);
    } else {
      console.log("ℹ️ Not first message, skipping intro");
    }
  }
});

//////////////////////////////////

// wa_client.on("message_create", async (msg) => {
//   const { body, fromMe, from, hasMedia } = msg;

//   if (!fromMe) return;

//   const isTanya = body.includes("sairing");

//   if (isTanya) {
//     let rawQuery = "";
//     let messageToAnalyze = msg;

//     // Check if this is a reply to another message
//     if (msg.hasQuotedMsg) {
//       try {
//         const quotedMsg = await msg.getQuotedMessage();
//         if (quotedMsg) {
//           // Use quoted message for analysis
//           messageToAnalyze = quotedMsg;

//           msg.reply("Oke, kami cek sebentar ya..");

//           try {
//             let response = "";

//             // Check for media in quoted message first
//             if (quotedMsg.hasMedia) {
//               console.log("Processing quoted message with media 180");
//               const messageContext = quotedMsg.body.replace("sairing", "")
//                 ? `Konteks pesan: ${quotedMsg.body}\n\n`
//                 : "";
//               response = await analyzeMediaMessage(quotedMsg);
//               // if (messageContext) {
//               //   console.log("Adding message context to media analysis");
//               //   response = messageContext + response;
//               // }
//             } else {
//               // Use text content for analysis
//               rawQuery = quotedMsg.body.replace("sairing", "");
//               if (rawQuery.startsWith("https") || rawQuery.startsWith("http")) {
//                 const summary = await getArticle(rawQuery);
//                 if (!summary.title && !summary.content) {
//                   msg.reply("title berita tidak ditemukan");
//                   return;
//                 }
//                 const getClearContent = await askingAI({
//                   input: `ambil bagan content nya ${summary.content}`,
//                 });
//                 response = await askingAI({
//                   input: `title : ${summary.title}, content:${getClearContent}`,
//                   prompt: promptData.checkHoax,
//                 });
//               } else {
//                 const hoaxCheckFromGoogle = await searchArticleWithGoogleAndAI(
//                   rawQuery
//                 );
//                 response = hoaxCheckFromGoogle.summerize;
//               }
//             }

//             if (response) {
//               wa_client.sendMessage(from, response);
//             }
//           } catch (error) {
//             console.error("Error analyzing message:", error);
//             msg.reply("Maaf, terjadi kesalahan saat menganalisis konten");
//           }
//         }
//       } catch (err) {
//         console.error("Error getting quoted message:", err);
//       }
//     } else {
//       // Direct message or forwarded message
//       msg.reply("Oke, kami cek sebentar ya..");

//       try {
//         let response = "";

//         // Check for media in original message
//         if (messageToAnalyze.hasMedia) {
//           console.log("Processing direct message with media");
//           const messageContext = messageToAnalyze.body.replace("sairing", "")
//             ? `Konteks pesan: ${messageToAnalyze.body}\n\n`
//             : "";
//           response = await analyzeMediaMessage(messageToAnalyze);
//           if (messageContext) {
//             console.log("Adding message context to media analysis");
//             response = messageContext + response;
//           }
//         } else {
//           // Use text content for analysis
//           rawQuery = body;
//           if (rawQuery.startsWith("https") || rawQuery.startsWith("http")) {
//             if (rawQuery.includes("tiktok.com")) {
//               const text = await linkTiktokMessage(rawQuery);

//               const googleSearchQuery = await askingAI({
//                 prompt: promptData.getHeadline,
//                 input: text,
//               });

//               let hoaxCheck = "";
//               // Search for articles and analyze with AI
//               const hoaxCheckFromGoogle = await searchArticleWithGoogleAndAI(
//                 googleSearchQuery
//               );
//               if (hoaxCheckFromGoogle.source.length > 0) {
//                 hoaxCheck = hoaxCheckFromGoogle.summerize;
//               } else {
//                 const hoaxCheckFromAI = await askingAI({
//                   prompt: promptData.checkHoaxWithoutArticles,
//                   input: googleSearchQuery,
//                 });
//                 hoaxCheck = hoaxCheckFromAI;
//               }

//               response = hoaxCheck;
//             } else {
//               const summary = await getArticle(rawQuery);
//               if (!summary.title && !summary.content) {
//                 msg.reply("title artikel tidak ditemukan");
//                 return;
//               }
//               const getClearContent = await askingAI({
//                 input: `ambil bagan content nya ${summary.content}`,
//               });
//               response = await askingAI({
//                 input: `title : ${summary.title}, content:${getClearContent}`,
//                 prompt: promptData.checkHoax,
//               });
//             }
//           } else {
//             const hoaxCheckFromGoogle = await searchArticleWithGoogleAndAI(
//               rawQuery
//             );
//             response = hoaxCheckFromGoogle.summerize;
//           }
//         }

//         if (response) {
//           wa_client.sendMessage(from, response);
//         }
//       } catch (error) {
//         console.error("Error analyzing message:", error);
//         msg.reply("Maaf, terjadi kesalahan saat menganalisis konten");
//       }
//     }
//   }
// });
