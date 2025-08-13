import { wa_client, current_qr, isLogin } from "./services/wa_client";
import express, { Request, Response } from "express";
import { PORT } from "./utils/env";
import cors from "cors";
import bodyParser from "body-parser";
import { getArticle } from "./services/scrap";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { downloadTikTokVideo } from "./services/linkVideo";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
export const wss = new WebSocketServer({ server });

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(
  cors({
    credentials: true,
  })
);

app.use(bodyParser.json());

app.post("/get-article", async (req: Request, res: Response) => {
  try {
    const { body } = req;
    const dataArticle = await getArticle(body.url);
    console.log(dataArticle);
    res.json({
      data: dataArticle,
    });
  } catch (err) {
    res.status(500).json({
      message: "error",
    });
  }
});

app.get("/", (req: Request, res: Response) => {
  res.render("index", { qr: current_qr, isLogin });
});

app.post("/tiktok", async (req: Request, res: Response) => {
  const { url } = req.body;
  const data = await downloadTikTokVideo(url, "./src/assets/video");
  console.log(data, "data");
  res.json({
    message: "success",
  });
});

// WebSocket connection handler
wss.on("connection", (ws) => {
  console.log("WebSocket client connected");
  // Send initial state to the connected client
  ws.send(JSON.stringify({ qr: current_qr, isLogin }));

  // Optional: Handle client messages if needed
  ws.on("message", (message: any) => {
    try {
      const data = JSON.parse(message);
      console.log(data);
      if (data.action === "logout") {
        const payload = JSON.stringify({ isLogin: false, qr: undefined });
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(payload);
          }
        });
        wa_client
          .logout()
          .then(() => {
            wa_client.destroy().then(() => {
              wa_client.initialize();
            });
          })
          .catch((err) => {
            console.log(`err logout: ${err}`);
          });
      }
    } catch (err) {
      console.error("WebSocket message error:", err);
    }
  });

  // Handle client disconnect
  ws.on("close", () => {
    console.log("WebSocket client disconnected");
  });
});
// Fungsi untuk menginisialisasi wa_client dengan retry
const initializeClient = async (retries = 3): Promise<void> => {
  try {
    await wa_client.initialize();
  } catch (error: any) {
    console.error(`WhatsApp initialization error: ${error.message}`);
    if (retries > 0) {
      console.log(
        `Retrying initialization in 5 seconds... (${retries} attempts remaining)`
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return initializeClient(retries - 1);
    } else {
      console.error(
        "Max retries reached. Could not initialize WhatsApp client."
      );
      throw error;
    }
  }
};

// Mulai inisialisasi saat server siap
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeClient();
});
