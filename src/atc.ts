import { createOpenAI } from "@ai-sdk/openai";
import { FREQUENCY_TYPES, resolveFacility, type Freq } from "./utils/facility";
import { distNm } from "./utils/math";
import { trace } from "./sim";
import { ensureSectors, sectorAt } from "./utils/sectors";
import { generateText, hasToolCall, stepCountIs, tool } from "ai";
import getSimbriefFlightPlan, { type FlightPlan } from "./simbrief";
import z from "zod";

const SYSTEM_PROMPT = `
You are an ATC controller in a flight simulator and you handle a singular plane.

Transmissions should be realistic with standard phraseology and without any explaining yourself or extra comments.
Only messages sent via the transmit tool will reach the pilot.

Frequencies, SIDs, STARs and runways must come from your data and shall never be invented, if you do not have taxiway data just tell them to taxi and hold short.

Do not invent any SIDs, STARs, taxiways, runways or frequencies (but do not ask the pilot for a frequency).
Identify yourself by the facility name and not "ATC" or "controller".
If the pilot does not say their callsign then you dont magically know who they are based on the live data.
If you are not the correct facility for what the pilot is requesting, then hand them over to the correct frequency.
Do not use the default squawk, use the generate tool and save that squawk to the assignements.
When handing the pilot over to another frequency always include the frequency in your transmission, when the pilot reads back the handoff do NOT repeat "contact ..." again, only say readback correct.
Do not repeat your instruction after the pilot reading it back, if its a long transmission then transmit readback correct, otherwise dont
Messages marked [EVENT] are not from the pilot but are automatically generated. If it warrants you telling the pilot something then transmit that
Always hand the pilot over to the next relevant controller if neccesary
`.trim();

const RESERVED_SQUAWKS = ["0000", "1200", "7500", "7600", "7700"];
function generateSquawk(): string {
  while (true) {
    const squawk = Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 8),
    ).join("");
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

  let loadedFlightPlan: FlightPlan | null = null;

  flightPlan.then((plan) => {
    if (!plan) return;
    loadedFlightPlan = plan;

    for (const code of [
      plan.origin.icao,
      plan.destination.icao,
      plan.alternate.icao,
      ...Object.values(plan.waypoints).map((w) => w.fir),
    ]) {
      ensureSectors(code!).catch((e) => {
        trace("error ensuring sectors for " + code + ": " + e.message);
      });
    }
  });

  let assigned: Record<string, any> = {
    flightPlanClearance: "NOT CLEARED",
  };

  let history: {
    role: "user" | "assistant";
    content: string;
  }[] = [];

  function send(text: string, state: any) {
    trace("send: " + text);

    const run = queue.then(() => prompt(text, state));
    queue = run.catch(() => {});

    return run;
  }

  function getSector(state: any) {
    if (!state) return null;
    if (state.latitude == null) return null;

    for (const prefix of state.nearbyPrefixes ?? []) {
      ensureSectors(prefix).catch((e) => {
        trace("error ensuring sectors for " + prefix + ": " + e.message);
      });
    }

    return sectorAt(state.latitude, state.longitude, state.indicatedAlt);
  }

  let last: { com1: number; facility: any } | null = null;

  function getFacility(state: any) {
    const facility = resolveFacility(
      state,
      Object.values(state?.airports ?? {}),
    );

    if (facility) {
      last = { com1: state.com1, facility };
      return facility;
    }

    const sector = getSector(state);
    if (sector && Math.abs(sector.mhz - state.com1) < 0.006) {
      last = {
        com1: state.com1,
        facility: {
          name: sector.name,
          freqType: sector.freqType,
          mhz: sector.mhz,
        },
      };

      return { name: sector.name, freqType: sector.freqType, mhz: sector.mhz };
    }

    if (last && Math.abs(last.com1 - state.com1) < 0.006) return last.facility;
    return null;
  }

  function approachTop(lat: number, lon: number) {
    for (let fl = 450; fl > 0; fl -= 5) {
      if ((sectorAt(lat, lon, fl * 100)?.freqType ?? 10) !== 10) return fl;
    }

    return;
  }

  let descentGiven = false;
  function checkDescent(state: any) {
    if (!loadedFlightPlan) return;

    const tod = loadedFlightPlan.tod;
    if (descentGiven || !tod || !state) return;

    const dist = distNm(state.latitude, state.longitude, tod.lat, tod.lon);
    if (!(dist <= 15)) return;

    descentGiven = true;

    let message = `[EVENT] The aircraft is within 15nm of its planned top of descent for arrival ${loadedFlightPlan?.destination.icao}, tell the aircraft to descent to a fitting level of your choice.`;

    const top = approachTop(
      loadedFlightPlan.destination.lat,
      loadedFlightPlan.destination.lon,
    );

    if (top) {
      message += ` ${loadedFlightPlan?.destination.icao} approach controller is FL${top} and below`;
    }

    return send(message, state);
  }

  let target: number | null = null;
  let since = 0;
  let handedOver = false;

  function tick(state: any) {
    if (!state || state.onGround) return;

    const descent = checkDescent(state);
    if (descent) return descent;

    const sector = getSector(state);
    const current = getFacility(state);

    const onSector =
      sector &&
      (Math.abs(sector.mhz - state.com1) < 0.006 ||
        (sector.freqType !== 10 && current?.name === sector.name));

    if (!sector || !current || onSector) {
      target = null;
      return null;
    }

    if (target !== sector.mhz) {
      target = sector.mhz;
      since = Date.now();
      handedOver = false;
      return null;
    }

    if (Date.now() - since < 5000 || handedOver) return null;

    handedOver = true;
    return send(
      `[EVENT] The aircraft has entered airspace controlled by ${sector.name} on ${sector.mhz.toFixed(3)} mhz, hand them over to ${sector.name} (even if the sector might have the same name as you)`,
      state,
    );
  }

  async function systemPrompt() {
    const plan = await flightPlan;
    if (!plan) return SYSTEM_PROMPT;

    return (
      SYSTEM_PROMPT +
      `\n
[Filed Flight Plan]
${plan.rules} from ${plan.origin.icao} to ${plan.destination.icao}, alternate is ${plan.alternate.icao}
${plan.aircraft} with requested cruise alt ${plan.cruiseAlt} ft

Route: ${plan.route}
SID: ${plan.sid ?? "not filed"}, STAR: ${plan.star ?? "not filed"}

Planned departure is runway ${plan.departureRunway}, planned arrival is runway ${plan.arrivalRunway}
Transition altitude is ${plan.transAlt} ft, transition level is ${plan.transLevel} ft

Departure METAR: ${plan.departureMetar ?? "not available"}
Arrival METAR: ${plan.arrivalMetar ?? "not available"}

    `.trimEnd()
    );
  }

  async function prompt(text: string, state: any) {
    const facility = getFacility(state);
    if (!facility) return null;

    const airport =
      (facility.icao && state.airports[facility.icao]) || nearestAirport(state);

    const compiled = compileState(
      state,
      facility.name,
      airport,
      await flightPlan,
    );
    trace("compiled:\n" + compiled);

    history.push({
      role: "user",
      content: text,
    });

    if (history.length > 20) {
      history = history.slice(-20);
    }

    // as the message wont really make sense without the user message
    if (history[0]?.role === "assistant") {
      history = history.slice(1);
    }

    const system = await systemPrompt();
    trace("system prompt:\n" + system);

    const messages = history.map((m, i) =>
      i === history.length - 1
        ? { ...m, content: compiled + "\n\n[Transmission]\n" + m.content }
        : m,
    );

    let transmission: string | null = null;

    const result = await generateText({
      model,
      system,
      messages,
      stopWhen: [hasToolCall("transmit"), stepCountIs(6)],
      maxOutputTokens: 25000,

      tools: {
        generateSquawk: tool({
          description: "Generate a 4-digit random transponder code",
          inputSchema: z.object({}),
          execute: async () => {
            if (!assigned.squawk) assigned.squawk = generateSquawk();
            return { squawk: assigned.squawk };
          },
        }),

        transmit: tool({
          description:
            "Transmit a message over radio to the pilot. This call should be consise and use standard atc phraseology, no comments, explanations or excuses. Call this last, after any other tool use.",
          inputSchema: z.object({ message: z.string() }),
          execute: async (input) => {
            transmission = input.message.trim();
            return { success: true };
          },
        }),

        recordInstruction: tool({
          description:
            "Record the instructions you just transmitted, call this before or in the same turn as you call transmit, not after",
          inputSchema: z.object({
            squawk: z.string().optional(),
            flightPlanClearance: z
              .enum(["NOT CLEARED", "IFR", "VFR"])
              .optional(),
            runway: z.string().optional(),
            speed: z
              .number()
              .nullable()
              .optional()
              .describe("knots, null to cancel"),
            altitude: z
              .number()
              .optional()
              .describe("altitude (ft) pilot is cleared for"),
            heading: z
              .number()
              .nullable()
              .optional()
              .describe("degrees, null to resume own navigation"),
          }),
          execute: async (input) => {
            if (input.squawk && !/^[0-7]{4}$/.test(input.squawk)) {
              return { error: "invalid squawk code" };
            }

            assigned = { ...assigned, ...input };
            return { success: true };
          },
        }),
      },
    }).catch((e) => {
      history.pop();
      throw e;
    });

    if (!transmission) {
      trace("no transmission, ai text was: " + result.text);
      history.pop();
      return null;
    }

    history.push({ role: "assistant", content: transmission });
    return { facility: facility.name, message: transmission };
  }

  function nearestAirport(state: any) {
    let closest = null;
    let closestNm = Infinity;

    for (const airport of Object.values(state?.airports ?? {})) {
      const nm = distNm(
        state?.latitude,
        state?.longitude,
        airport.lat,
        airport.long,
      );

      if (nm < closestNm) {
        closest = airport;
        closestNm = nm;
      }
    }

    return closest;
  }

  function compileState(
    state: any,
    controller: string,
    airport: any,
    flightPlan: FlightPlan | null,
  ) {
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

    [Current Airport]
    ICAO: ${airport?.icao}
    Latitude: ${airport?.lat.toFixed(6)}
    Longitude: ${airport?.long.toFixed(6)}
    Altitude (AMSL): ${Math.round(airport?.alt)} ft
    Distance: ${distNm(state?.latitude, state?.longitude, airport?.lat, airport?.long).toFixed(2)} nm

    [${airport?.icao} Runways]
    ${airport?.runways?.map((r: any) => `- ${r.ids[0]} / ${r.ids[1]} (${r.length} ft x ${r.width} ft, heading ${r.hdg}°)`).join("\n\t")}

    [${airport?.icao} Frequencies]
    ${airport?.frequencies?.map((f: any) => `- ${f.name} (${(f.hz / 1e6).toFixed(3)} MHz) [Type: ${FREQUENCY_TYPES[f.freqType]}]`).join("\n\t")}
    `.trim();

    return compiled;
  }

  return {
    send,
    tick,
    getFacility,
  };
}
