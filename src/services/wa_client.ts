import WhatsAppWebJS from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { askingAI, searchArticleWithGoogleAndAI } from "./ai_agent";
import { analyzeHoaxMessage } from "./parser";
import { promptData } from "../utils/prompt";
import { getArticleContent } from "./scrap";

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

// for self response
wa_client.on("message_create", async (msg) => {
  const { body, fromMe, from, hasMedia } = msg;

  if (!fromMe) return;

  const isTanya = body.includes("--tanya");

  if (isTanya) {
    let rawQuery = body.replace("--tanya", "");

    msg.reply("Baik kami akan memeriksa artikel tersebut, sebentar yaa..");

    try {
      if (hasMedia) {
        const response = await analyzeHoaxMessage(msg);

        const querySummary = await askingAI({
          input: response || "",
          prompt: promptData.getHeadline,
        });
        const getHoax = await askingAI({
          input: response || "",
          prompt: promptData.checkHoax,
        });

        wa_client.sendMessage(from, `memulai context pertanyaan`);
        wa_client.sendMessage(from, `${querySummary} --tanya`);
        wa_client.sendMessage(from, getHoax);

        // const hoaxCheckFromKompas = await searchArticleWithGoogleAndAI(
        //   querySummary
        // );

        // console.log("menanyakan", querySummary);

        // wa_client.sendMessage(from, hoaxCheckFromKompas.summerize);
        // hoaxCheckFromKompas?.source?.forEach((source: any) => {
        //   wa_client.sendMessage(from, source.link);
        // });
      } else {
        if (msg.body.startsWith("https") || msg.body.startsWith("http")) {
          const summary = await getArticleContent(rawQuery);
          const result = await askingAI({
            input: summary,
            prompt: promptData.checkHoax,
          });
          wa_client.sendMessage(from, result);
        } else {
          const query = rawQuery;
          const hoaxCheckFromKompas = await searchArticleWithGoogleAndAI(query);
          wa_client.sendMessage(from, hoaxCheckFromKompas.summerize);
          hoaxCheckFromKompas?.source?.forEach((source: any) => {
            wa_client.sendMessage(from, source.link);
          });
        }
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
