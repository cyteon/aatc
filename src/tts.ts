const numbers = {
  "0": "zero",
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
};

import Replicate from "replicate";
import path from "node:path";
import { trace } from "./sim";
import { playAudioFile } from "audic";

const replicate = new Replicate({
  baseUrl: process.env.REPLICATE_BASE_URL,
  auth: process.env.REPLICATE_API_TOKEN,
});

function fixPronounciation(text: string): string {
  const runwayRegex = /(\d{2})[C|L|R]/g;

  text = text.replace(runwayRegex, (match) => {
    const n = match.slice(0, 2);
    const l = match.slice(2);

    return n + (l === "L" ? "left" : l === "R" ? "right" : "center");
  });

  text = text.replace(/(\d)/g, (num) => " " + numbers[num] + " ");

  trace("tts input: " + text);

  return text;
}

let ttsIndex = 0;

export async function tts(text: string): Promise<void> {
  trace("tts: " + text);

  const input = {
    voice: "Ashley",
    text: fixPronounciation(text),
  };

  const output = await replicate.run(process.env.REPLICATE_MODEL!, { input });

  if (!output) {
    trace("no tts output for: " + text);
  }

  const blob = (await output.blob()) as Blob;
  const buffer = await blob.arrayBuffer();

  const filePath = path.join(__dirname, `tts-${ttsIndex++}.wav`);

  await Bun.write(filePath, buffer);

  await playAudioFile(filePath);

  const file = Bun.file(filePath);
  await file.delete();
}
