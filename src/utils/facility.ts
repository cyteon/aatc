import type { Handoff } from "../atc";
import { trace } from "../sim";
import { distNm } from "./math";

export const FREQUENCY_TYPES: Record<number, string> = {
  0: "NONE",
  1: "ATIS",
  2: "MULTICOM",
  3: "UNICOM",
  4: "CTAF",
  5: "GROUND",
  6: "TOWER",
  7: "CLEARANCE",
  8: "APPROACH",
  9: "DEPARTURE",
  10: "CENTER",
  11: "FSS",
  12: "AWOS",
  13: "ASOS",
  14: "CPT",
  15: "GCO",
};

export const RANGE_NM: Record<number, number> = {
  5: 10,
  7: 10,
  14: 10,
  6: 30,
  1: 60,
  8: 60,
  9: 60,
  11: 100,
  10: 250,
};

export type Freq = { freqType: number; hz: number; name: string };

export function resolveFacility(
  state: any,
  airports: any[],
  handoffs: Handoff[],
) {
  const com1 = state?.com1;
  if (!(com1 >= 118 && com1 <= 137)) return null;

  const closest = airports
    .map((ap) => ({
      ap,
      nm: distNm(state?.latitude, state?.longitude, ap.lat, ap.long),
    }))
    .sort((a, b) => a.nm - b.nm);

  for (const { ap, nm } of closest) {
    const freq = ap.frequencies?.find(
      (f: Freq) => Math.abs(f.hz / 1e6 - com1) < 0.006,
    );
    if (!freq) continue;

    if (nm > (RANGE_NM[freq.freqType] ?? 25)) continue;

    return {
      name: facilityName(freq, ap.icao),
      freqType: freq.freqType,
      icao: ap.icao,
    };
  }

  const handed = handoffs.find((h) => Math.abs(h.mhz - com1) < 0.006);
  if (handed) return { name: handed.name, freqType: 10 };

  return null;
}

export function onFreq(com1: number, freqs: Freq[]) {
  const hit = freqs.find((f) => Math.abs(f.hz / 1e6 - com1) < 0.006);

  return hit
    ? {
        role: FREQUENCY_TYPES[hit.freqType],
        hz: hit.hz / 1e6,
        name: hit.name,
      }
    : null;
}

export function findFreqs(freqType: number, freqs: Freq[]) {
  return freqs.filter((f) => f.freqType === freqType);
}

export function knownFreq(com1: number, airports: any[]) {
  return airports.some((ap) =>
      ap.frequencies?.some((f: Freq) => Math.abs(f.hz / 1e6 - com1) < 0.006),
  );
}

const FREQUENCY_READABLE: Record<number, string> = {
  1: "ATIS",
  2: "Multicom",
  3: "Unicom",
  4: "Traffic",
  5: "Ground",
  6: "Tower",
  7: "Delivery",
  8: "Approach",
  9: "Departure",
  10: "Control",
  11: "Radio",
  12: "AWOS",
  13: "ASOS",
  14: "Pre-Taxi",
  15: "Clearance",
};

const title = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");

export function facilityName(freq: Freq, airportName: string) {
  const role = FREQUENCY_READABLE[freq.freqType] ?? "";
  const place = title(freq.name)
    .split(" ")
    .filter((w) => w.toLowerCase() !== role.toLowerCase())
    .join(" ");

  return `${place || title(airportName)} ${role}`.trim();
}
