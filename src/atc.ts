import { createOpenAI } from "@ai-sdk/openai";

export function createAtc() {
  const model = process.env.OPENAI_MODEL;
  const client = createOpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
  });

  let queue: Promise<any> = Promise.resolve();

  let history: {
      role: "user" | "assistant";
      content: string;
  }[] = [];

  function send(text: string, state: any) {

  }

  return { send };
}
