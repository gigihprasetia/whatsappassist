import wa_client from "./services/wa_client";
import express from "express";
import { PORT } from "./utils/env";

const app = express();

app.listen(PORT, () => {
  console.log(`listen on port ${PORT}`);
  wa_client.initialize();
});
