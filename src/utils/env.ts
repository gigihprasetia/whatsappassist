import dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT;
export const OPEN_API_KEY = process.env.OPEN_AI_KEY;
export const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
export const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
