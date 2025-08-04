import wa_client from "./services/wa_client";
import express, { Request, Response } from "express";
import { PORT } from "./utils/env";
import cors from "cors";
import bodyParser from "body-parser";
import { getArticle } from "./services/scrap";

const app = express();
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

app.listen(PORT, () => {
  console.log(`listen on port ${PORT}`);
  wa_client.initialize();
});
