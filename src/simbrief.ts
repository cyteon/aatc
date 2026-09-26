import { trace } from "./sim";

export type FlightPlan = {
  rules: "IFR" | "VFR";
  aircraft: string;

  origin: string;
  destination: string;
  alternate: string;

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
      long: number;
      alt: number;
      stage: "CLB" | "CRZ" | "DSC";
      fir: string | null;
    }
  >;
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

    const flightPlan: FlightPlan = {
      rules: data.atc.flight_rules === "I" ? "IFR" : "VFR",
      aircraft: data.aircraft?.icaocode,

      origin: data.origin?.icao_code,
      destination: data.destination?.icao_code,
      alternate: data.alternate?.icao_code,

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
          .filter((fix: any) => fix.type != "ltlg")
          .map((fix: any) => [
            fix.ident,
            {
              lat: parseFloat(fix.pos_lat),
              long: parseFloat(fix.pos_long),
              alt: parseInt(fix.altitude_feet),
              stage: fix.stage,
              fir: fix.fir,
            },
          ]),
      ),
    };

    return flightPlan;
  } catch (error) {
    trace("error fetching simbrief flight plan: " + error);
  }

  return null;
}
