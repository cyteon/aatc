import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = path.join(process.env.APPDATA ?? os.homedir(), "aatc");
const file = path.join(dir, "config.json");

const fields = [
  {
    key: "OPENAI_BASE_URL",
    label: "OpenAI-compatible base url",
    default: "https://api.openai.com/v1",
  },
  {
    key: "OPENAI_API_KEY",
    label: "LLM API Key",
  },
  {
    key: "OPENAI_MODEL",
    label: "Model",
    default: "anthropic/claude-haiku-5.5",
  },
  {
    key: "REPLICATE_BASE_URL",
    label: "Replicate base url",
    default: "https://api.replicate.com/v1",
  },
  {
    key: "REPLICATE_API_TOKEN",
    label: "Replicate API Token",
  },
  {
    key: "SIMBRIEF_USER_ID",
    label: "SimBrief User ID",
  },
];

let saved = {};

try {
  saved = JSON.parse(await Bun.file(file).text());
} catch {}

let changed = false;

for (const field of fields) {
  if (process.env[field.key]) continue;

  if (saved[field.key] === undefined) {
    let value = "";

    while (!value) {
      const hint = field.default ? ` [${field.default}]` : "";
      value = prompt(`${field.label}${hint}:`)?.trim() ?? "";

      if (!value && field.default) {
        value = field.default;
        break;
      }
    }

    saved[field.key] = value;
    changed = true;
  }

  if (saved[field.key]) process.env[field.key] = saved[field.key];
}

if (changed) {
  fs.mkdirSync(dir, { recursive: true });
  Bun.write(file, JSON.stringify(saved, null, 2));
  console.log("saved config to " + file);
}
