import { createOpenAI } from "@ai-sdk/openai";
import { FREQUENCY_TYPES, resolveFacility } from "./utils/facility";
import { distNm } from "./utils/math";
import { trace } from "./sim";
import { generateText, stepCountIs } from "ai";
import { hi } from "zod/v4/locales";

const SYSTEM_PROMPT = `
You are an ATC controller in a flight simulator and you handle a singular plane.

Transmissions should be realistic with standard phraseology and without any explaining yourself or extra comments.
Only use facts from the state block or a tool result, if you do not have the needed information respond with unable and ask the pilot.

Do not invent any SIDs, STARs, taxiways, frequencies or anything else.
Identify yourself by the facility name and not "ATC" or "controller".
If the pilot does not say their callsign then you dont magically know who they are based on the live data.
If you are not the correct facility for what the pilot is requesting, then hand them over to the correct frequency.
`.trim();

export function createAtc() {
  const provider = createOpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
  });
  const model = provider(process.env.OPENAI_MODEL!);

  let queue: Promise<any> = Promise.resolve();
  let assigned: Record<string, any> = {};

  let history: {
      role: "user" | "assistant";
      content: string;
  }[] = [];

  function send(text: string, state: any) {
    const run = queue.then(() => prompt(text, state));
    queue = run.catch(() => { });

    return run;
  }

  async function prompt(text: string, state: any) {
    const airports = Object.values(state?.airports ?? {});
    const facility = resolveFacility(state, airports);
    if (!facility) return null;

    const closestAirport = nearestAirport(state);

    const compiled = compileState(state, facility.name, closestAirport);
    trace("compiled:\n" + compiled);

    history.push({ role: "user", content: compiled + "\n\n[Transmission]\n" + text });

    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: history,
      stopWhen: stepCountIs(6),
    });

    const message = result?.text?.trim() ?? "(no reply)";
    history.push({ role: "assistant", content: message });

    return {
      facility: facility.name,
      message,
    }
  }

  function nearestAirport(state: any) {
    let closest = null;
    let closestNm = Infinity;

    for (const airport of Object.values(state?.airports ?? {})) {
      const nm = distNm(state?.latitude, state?.longitude, airport.lat, airport.long);

      if (nm < closestNm) {
        closest = airport;
        closestNm = nm;
      }
    }

    return closest;
  }

  function compileState(state: any, controller: string, closestAirport: any) {
    let compiled = `

    Facility name: ${controller}.

    [Aircraft State]
    Callsign: ${state?.callsign}
    Squawk: ${state?.squawk}
    Altitude (AMSL): ${Math.round(state?.indicatedAlt)} ft
    Heading (Mag): ${Math.round(state?.magHeading)}°
    Speed (IAS): ${Math.round(state?.iasKt)} kts
    Latitude: ${state?.latitude.toFixed(6)}
    Longitude: ${state?.longitude.toFixed(6)}

    [Assignements]
    ${JSON.stringify(assigned)}

    [Closest Airport]
    ICAO: ${closestAirport?.icao}
    Latitude: ${closestAirport?.lat.toFixed(6)}
    Longitude: ${closestAirport?.long.toFixed(6)}
    Altitude (AMSL): ${Math.round(closestAirport?.alt)} ft
    Distance: ${distNm(state?.latitude, state?.longitude, closestAirport?.lat, closestAirport?.long).toFixed(2)} nm

    [${closestAirport?.icao} Frequencies]

    `.trim();

    if (closestAirport.frequencies) {
      for (const freq of closestAirport.frequencies) {
        compiled += `\n\t- ${freq.name} (${(freq.hz / 1e6).toFixed(3)} MHz) [Type: ${FREQUENCY_TYPES[freq.freqType]}]`;
      }
    }

    return compiled;
  }

  return { send };
}
