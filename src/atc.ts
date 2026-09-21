import { createOpenAI } from "@ai-sdk/openai";
import { FREQUENCY_TYPES, resolveFacility } from "./utils/facility";
import { distNm } from "./utils/math";
import { trace } from "./sim";
import { generateText, stepCountIs, tool } from "ai";
import getSimbriefFlightPlan, { type FlightPlan } from "./simbrief";
import z from "zod";

const SYSTEM_PROMPT = `
You are an ATC controller in a flight simulator and you handle a singular plane.

Transmissions should be realistic with standard phraseology and without any explaining yourself or extra comments.
Only use facts from the state block or a tool result, if you do not have the needed information respond with unable and ask the pilot.

Do not invent any SIDs, STARs, taxiways, frequencies or anything else.
Identify yourself by the facility name and not "ATC" or "controller".
If the pilot does not say their callsign then you dont magically know who they are based on the live data.
If you are not the correct facility for what the pilot is requesting, then hand them over to the correct frequency.
Do not use the default squawk, use the generate tool and save that squawk to the assignements.
When handing the pilot over to another frequency always include the frequency in your transmission.
`.trim();

const RESERVED_SQUAWKS = ["0000", "1200", "7500", "7600", "7700"];
function generateSquawk(): string {
  while (true) {
    const squawk = Array.from({ length: 4 }, () => Math.floor(Math.random() * 8)).join("");
    if (!RESERVED_SQUAWKS.includes(squawk)) return squawk;
  }
}

export function createAtc() {
  const provider = createOpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
  });
  const model = provider(process.env.OPENAI_MODEL!);

  let queue: Promise<any> = Promise.resolve();

  let flightPlan = getSimbriefFlightPlan().catch((e) => {
      trace("error fetching simbrief flight plan: " + e.message);
      return null;
  });

  let assigned: Record<string, any> = {};

  let history: {
      role: "user" | "assistant";
      content: string;
  }[] = [];

  function send(text: string, state: any) {
    trace("send: " + text);

    const run = queue.then(() => prompt(text, state));
    queue = run.catch(() => { });

    return run;
  }

  async function systemPrompt() {
    const plan = await flightPlan;
    if (!plan) return SYSTEM_PROMPT;

    return SYSTEM_PROMPT + `\n
[Filed Flight Plan]
${plan.rules} from ${plan.origin} to ${plan.destination}, alternate is ${plan.alternate}
${plan.aircraft} with requested cruise alt ${plan.cruiseAlt} ft

Route: ${plan.route}
SID: ${plan.sid ?? "not filed"}, STAR: ${plan.star ?? "not filed"}

Planned departure is runway ${plan.departureRunway}, planned arrival is runway ${plan.arrivalRunway}
Transition altitude is ${plan.transAlt} ft, transition level is ${plan.transLevel} ft

Departure METAR: ${plan.departureMetar ?? "not available"}
Arrival METAR: ${plan.arrivalMetar ?? "not available"}

    `.trimEnd();
  }

  async function prompt(text: string, state: any) {
    const airports = Object.values(state?.airports ?? {});
    const facility = resolveFacility(state, airports);
    if (!facility) return null;

    const closestAirport = nearestAirport(state);

    const compiled = compileState(state, facility.name, closestAirport, await flightPlan);
    trace("compiled:\n" + compiled);

    history.push({ role: "user", content: compiled + "\n\n[Transmission]\n" + text });

    const system = await systemPrompt();
    trace("system prompt:\n" + system);

    const result = await generateText({
      model,
      system,
      messages: history,
      stopWhen: stepCountIs(6),

      tools: {
        generateSquawk: tool({
          description: "Generate a 4-digit random transponder code",
          inputSchema: z.object({}),
          execute: async () => {
            if (!assigned.squawk) assigned.squawk = generateSquawk();
            return { squawk: assigned.squawk };
          }
        })
      }
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

  function compileState(state: any, controller: string, closestAirport: any, flightPlan: FlightPlan | null) {
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

  return { send }
}
