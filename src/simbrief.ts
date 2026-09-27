import { trace } from "./sim";

export type FlightPlan = {
  rules: "IFR" | "VFR";
  aircraft: string;

  origin: {
    icao: string;
    lat: number;
    lon: number;
  };

  destination: {
    icao: string;
    lat: number;
    lon: number;
  };

  alternate: {
    icao: string;
    lat: number;
    lon: number;
  };

  departureRunway: string;
  arrivalRunway: string;
  transAlt: number | null;
  transLevel: number | null;

  departureMetar: string | null;
  arrivalMetar: string | null;

  cruiseAlt: number | null;
  route: string;
  sid: string | null;
  star: string | null;

  waypoints: Record<
    string,
    {
      lat: number;
      lon: number;
      alt: number;
      stage: "CLB" | "CRZ" | "DSC";
      fir: string | null;
    }
  >;

  tod: {
    lat: number;
    lon: number;
  } | null;
};

export default async function getSimbriefFlightPlan(): Promise<FlightPlan | null> {
  try {
    const response = await fetch(
      `https://www.simbrief.com/api/xml.fetcher.php?userid=${process.env.SIMBRIEF_USER_ID}&json=1`,
    );

    if (!response.ok) {
      trace("error fetching simbrief flight plan: " + response.statusText);
      return null;
    }

    const data = (await response.json()) as any;

    if (!data) {
      trace("error fetching simbrief flight plan: no flight data");
      return null;
    }

    const fixes = data.navlog?.fix ?? [];
    const tod = fixes.find((fix: any) => fix.ident === "TOD");

    const flightPlan: FlightPlan = {
      rules: data.atc.flight_rules === "I" ? "IFR" : "VFR",
      aircraft: data.aircraft?.icaocode,

      origin: {
        icao: data.origin?.icao_code,
        lat: data.origin?.pos_lat ? parseFloat(data.origin.pos_lat) : 0,
        lon: data.origin?.pos_long ? parseFloat(data.origin.pos_long) : 0,
      },

      destination: {
        icao: data.destination?.icao_code,
        lat: data.destination?.pos_lat
          ? parseFloat(data.destination.pos_lat)
          : 0,
        lon: data.destination?.pos_long
          ? parseFloat(data.destination.pos_long)
          : 0,
      },

      alternate: {
        icao: data.alternate?.icao_code,
        lat: data.alternate?.pos_lat ? parseFloat(data.alternate.pos_lat) : 0,
        lon: data.alternate?.pos_long ? parseFloat(data.alternate.pos_long) : 0,
      },

      departureRunway: data.origin?.plan_rwy,
      arrivalRunway: data.destination?.plan_rwy,
      transAlt: data.origin?.trans_alt ? parseInt(data.origin.trans_alt) : null,
      transLevel: data.origin?.trans_level
        ? parseInt(data.origin.trans_level)
        : null,

      departureMetar: data.origin?.metar,
      arrivalMetar: data.destination?.metar,

      cruiseAlt: data.general?.initial_altitude
        ? parseInt(data.general.initial_altitude)
        : null,
      route: data.atc?.route_ifps,
      sid: fixes[0]?.via_airway,
      star: fixes.at(-1)?.via_airway,

      waypoints: Object.fromEntries(
        fixes
          .filter((fix: any) => fix.ident !== "TOD" && fix.ident !== "TOC")
          .map((fix: any) => [
            fix.ident,
            {
              lat: parseFloat(fix.pos_lat),
              lon: parseFloat(fix.pos_long),
              alt: parseInt(fix.altitude_feet),
              stage: fix.stage,
              fir: fix.fir,
            },
          ]),
      ),

      tod: tod
        ? {
            lat: parseFloat(tod.pos_lat),
            lon: parseFloat(tod.pos_long),
          }
        : null,
    };

    trace(
      "fetched simbrief flight plan: " + JSON.stringify(flightPlan, null, 2),
    );

    return flightPlan;
  } catch (error) {
    trace("error fetching simbrief flight plan: " + error);
  }

  return null;
}
