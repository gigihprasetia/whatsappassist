import WhatsAppWebJS from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { askingAI, searchArticleWithGoogleAndAI } from "./ai_agent";
import { analyzeHoaxMessage } from "./parser";
import { promptData } from "../utils/prompt";
import { getArticle, getArticleContent } from "./scrap";

async function analyzeMediaMessage(message: any): Promise<string> {
  const summary = await analyzeHoaxMessage(message) || "";
  console.log("summary", summary);
  const getHeadline = await askingAI({
    prompt: promptData.getHeadline,
    input: `${summary}`,
  });
  const hoaxCheckFromKompas = await searchArticleWithGoogleAndAI(getHeadline);
  const response = hoaxCheckFromKompas.summerize;

  return response;
}

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
  const { body, fromMe, from, hasMedia } = msg;

  // Skip messages sent by us to prevent duplicate handling
  if (fromMe) return;

  // Initialize variables for checks
  let isMentioned = false;
  const hasKeyword = body.toLowerCase().includes("sairing");
  const isForwarded = msg.isForwarded;

  // Check for mentions in group chats
  if (from.endsWith('@g.us')) {
    try {
      const mentionedContacts = await msg.getMentions();
      const info = await wa_client.info;
      isMentioned = mentionedContacts.some(contact => contact.id._serialized === info.wid._serialized);
    } catch (error) {
      console.error('Error checking mentions:', error);
    }
  }

  const isAsking = isMentioned || hasKeyword || isForwarded;
  console.log("Message received:", { isForwarded, isMentioned, hasKeyword });
  let summary = "";
  const greetingWords = ['halo', 'hi', 'hello', 'hay', 'hei', 'hey', 'assalamualaikum', 'asalamualaikum', 'assalamualaikum', 'asalamualaikum', 'assalam', 'asalam', 'salam', 'slm', 'aslm', 'asw', 'asm', 'assalamualaikum wr wb', 'asalamualaikum wr wb', 'assalamu alaikum', 'asalamu alaikum', 'aslmkm', 'asslmklm', 'p', 'pagi', 'siang', 'sore', 'malam'];
  const isGreeting = greetingWords.some(word => msg.body.startsWith(word)) && msg.body.includes('sairing');
  
  if (isGreeting) {
    console.log('👋 Greeting detected, sending intro message');
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
              console.log("Processing quoted message with media");
              response = await analyzeMediaMessage(quotedMsg);
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
      msg.reply("Oke, kami cek sebentar ya..");

      try {
        let response = "";

        // Check for media in original message
        if (messageToAnalyze.hasMedia) {
          response = await analyzeMediaMessage(messageToAnalyze);
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
import { isKnownGroup, addKnownGroup } from '../utils/group_cache';

// Listen for group messages and handle first-time interactions
wa_client.on('message', async (message) => {
  if (message.from.endsWith('@g.us')) {
    const chat = await message.getChat();
    
    console.log('👥 Checking group:', chat.id._serialized);
    if (!isKnownGroup(chat.id._serialized)) {
      console.log('✨ New group detected, sending intro message');
      addKnownGroup(chat.id._serialized);
      chat.sendMessage(introMessage);
    } else {
      console.log('ℹ️ Group already known, skipping intro');
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
    console.log('📱 Private chat detected');
    const chatMessages = await chat.fetchMessages({ limit: 2 }); // Fetch 2 messages to check if this is first
    console.log('📨 Number of messages in chat:', chatMessages.length);
    
    if (chatMessages.length === 1) {
      console.log('✨ First message in private chat, sending intro');
      chat.sendMessage(introMessage);
    } else {
      console.log('ℹ️ Not first message, skipping intro');
    }
  }
});

export default wa_client;
