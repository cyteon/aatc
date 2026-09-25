import { trace } from "../sim";

const CDN = "https://cdn.jsdelivr.net/gh/lennycolton/vatglasses-data@main/data";
const FILES =
  "https://data.jsdelivr.com/v1/packages/gh/lennycolton/vatglasses-data@main?structure=flat";

const FREQUENCY_TYPES = { GND: 5, TWR: 6, DEL: 7, APP: 8, DEP: 9, CTR: 10 };

type Sector = {
  name: string;
  mhz: number;
  freqType: number;
  minFl: number;
  maxFl: number;
  points: number[][];
};

const isSplit = new Map<string, boolean>();

const filesLoaded: Promise<void> = (async () => {
  try {
    const response = await fetch(FILES);
    const data = await response.json();

    for (const file of data.files) {
      const match = /^\/data\/([^/.]+)(\/)?.*\.json$/.exec(file.name);
      if (match) isSplit.set(match[1], !!match[2]);
    }
  } catch (error) {
    trace("error fetching sector file data: " + error);
  }
})();

let sectors: Sector[] = [];
let loaded = new Set<string>();

function dmsToDecimal(s: string) {
  const sign = s[0] === "-" ? -1 : 1;
  const digits = s.replace("-", "");
  const dotIndex = digits.indexOf(".");
  const degreeDigits = (dotIndex >= 0 ? dotIndex : digits.length) - 4;

  const degrees = Number(digits.slice(0, degreeDigits));
  const minutes = Number(digits.slice(degreeDigits, degreeDigits + 2));
  const seconds = Number(digits.slice(degreeDigits + 2));

  return sign * (degrees + minutes / 60 + seconds / 3600);
}

async function fetchSector(key: string) {
  const response = await fetch(`${CDN}/${key}.json`);
  return await response.json();
}

async function loadSector(key: string) {
  let airspaces: any[];
  let positions: any;

  if (isSplit.get(key)) {
    const [airspaceSlice, positionsSlice, ownership] = await Promise.all([
      fetchSector(`${key}/airspace`),
      fetchSector(`${key}/positions`),
      fetchSector(`${key}/ownership/default`),
    ]);

    airspaces = Object.entries(airspaceSlice.airspace).map(
      ([id, s]: [string, any]) => ({
        ...s,
        owner: ownership.airspace[id],
      }),
    );

    positions = positionsSlice.positions;
  } else {
    const data = await fetchSector(key);
    airspaces = data.airspace;
    positions = data.positions;
  }

  for (const airspace of airspaces) {
    const position = positions[airspace.owner?.[0]];
    if (!position) continue;

    for (const sector of airspace.sectors) {
      sectors.push({
        name: position.callsign,
        mhz: parseFloat(position.frequency),
        freqType: FREQUENCY_TYPES[position.type] ?? 10,
        minFl: sector.min ?? 0,
        maxFl: sector.max ?? 999,
        points: sector.points.map(([la, lo]: [string, string]) => [
          dmsToDecimal(la),
          dmsToDecimal(lo),
        ]),
      });
    }
  }

  trace(`new sectors list: ${JSON.stringify(sectors, null, 2)}`);
}

function keysFor(code: string) {
  code = code.toLowerCase();

  // canada codes are C*** and US codes are K***
  if (/^[kc]z/.test(code)) code = code.slice(1);

  const keys = [...isSplit.keys()];

  for (let n = Math.min(4, code.length); n > 0; n--) {
    const key = keys.find((k) => k.split("-").includes(code.slice(0, n)));
    if (key) return [key];
  }

  return keys.filter((k) => k.startsWith(code));
}

export async function ensureSectors(code: string) {
  await filesLoaded;

  for (const key of keysFor(code)) {
    if (loaded.has(key)) continue;
    loaded.add(key);
    await loadSector(key);
  }
}
