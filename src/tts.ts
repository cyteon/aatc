import Replicate from "replicate";
import path from "node:path";
import { trace } from "./sim";
import { playAudioFile } from "audic";

// prettier-ignore
const numbers = {
  "0": "zero", "1": "one", "2": "two", "3": "three",
  "4": "four", "5": "five", "6": "six", "7": "seven",
  "8": "eight", "9": "nine",
};

// prettier-ignore
const phonetics = {
  "A": "alpha", "B": "bravo", "C": "charlie", "D": "delta",
  "E": "echo", "F": "foxtrot", "G": "golf", "H": "hotel",
  "I": "india", "J": "juliet", "K": "kilo", "L": "lima",
  "M": "mike", "N": "november", "O": "oscar", "P": "papa",
  "Q": "quebec", "R": "romeo", "S": "sierra", "T": "tango",
  "U": "uniform", "V": "victor", "W": "whiskey", "X": "x-ray",
  "Y": "yankee", "Z": "zulu",
};

// prettier-ignore
const abbreviations = {
  "QNH": "Q N H", "QFE": "Q F E", "ILS": "I L S",
  "VOR": "V O R", "DME": "D M E", "NDB": "N D B", "VFR": "V F R",
  "IFR": "I F R", "ATC": "A T C", "RNAV": "R nav"
};

// prettier-ignore
const airlines = {
  "SAS": "Scandinavian", "WIF": "Widerøe", "DLH": "Lufthansa",
  "BAW": "Speedbird", "KLM": "K L M"
};

const replicate = new Replicate({
  baseUrl: process.env.REPLICATE_BASE_URL,
  auth: process.env.REPLICATE_API_TOKEN,
});

function fixPronounciation(text: string): string {
  const runwayRegex = /\b(\d{2})[CLR]\b/g;

  text = text.replace(runwayRegex, (match) => {
    const n = match.slice(0, 2);
    const l = match.slice(2);

    return n + (l === "L" ? " left" : l === "R" ? " right" : " center");
  });

  text = text.replace(/\b([A-Z]{3})(\d{1,4}[A-Z]{0,2})\b/g, (m, p, r) => {
    return airlines[p] ? airlines[p] + " " + r : m;
  });

  text = text.replace(/\b(?=[A-Z0-9]*\d)[A-Z0-9]+\b/g, (token) =>
    token.replace(/[A-Z]/g, (letter) => " " + phonetics[letter] + " "),
  );

  text = text.replace(/\b(1[1-3]\d)\.(\d{1,3})\b/g, (_, mhz, khz) => {
    return (
      mhz +
      " decimal " +
      (khz.length === 3 && khz.endsWith("00") ? khz[0] : khz)
    );
  });

  text = text.replace(/(\d)/g, (num) => " " + numbers[num] + " ");

  text = text.replace(/\b[A-Z]{2,4}\b/g, (word) => abbreviations[word] ?? word);

  trace("tts input: " + text);

  return text;
}

let ttsIndex = 0;

export async function tts(text: string): Promise<void> {
  trace("tts: " + text);

  const input = {
    voice_id: "Dennis",
    text: fixPronounciation(text),
    volume: 2,
  };

  const output = await replicate.run("inworld/realtime-tts-1.5-mini", {
    input,
  });

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
