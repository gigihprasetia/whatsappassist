import OpenAI from 'openai';

if (!process.env.OPEN_AI_KEY) {
  throw new Error('OPEN_AI_KEY environment variable is required');
}

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

export async function analyzeImageWithGPT4(imageBuffer: Buffer): Promise<string> {
  try {
    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Tolong jelaskan isi gambar ini dengan detail. Berikan deskripsi yang lengkap tentang apa yang kamu lihat, termasuk teks yang mungkin ada di dalam gambar. Gunakan bahasa yang natural dan mudah dipahami." 
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        }
      ],
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || "Maaf, tidak dapat menganalisis gambar.";
  } catch (error) {
    console.error("Error analyzing image with GPT-4:", error);
    throw error;
  }
}
