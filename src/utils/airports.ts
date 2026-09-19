import { FacilityDataType } from "node-simconnect";

const AIRCRAFT_OK = [1, 2, 3, 4];
const HOLD_SHORT = [2, 4, 5, 6];

export function structureAirportData(nodes: Map<number, any>) {
    const all = [...nodes.values()];
    const airport = all.find(node => node.type === FacilityDataType.AIRPORT);

    const points = new Map(all.filter(node => node.type === FacilityDataType.TAXI_POINT).map(node => [node.index, node]));
    const names = new Map(all.filter(node => node.type === FacilityDataType.TAXI_NAME).map(node => [node.index, node.name]));
    const paths = all.filter(node => node.type === FacilityDataType.TAXI_PATH);

    const data = {
        icao: airport?.icao,
        lat: airport?.lat,
        long: airport?.long,
        alt: Math.round(airport?.alt),

        frequencies: all.filter(node => node.type === FacilityDataType.FREQUENCY).map(f => ({
            type: f.freqType,
            hz: f.hz,
            name: f.name
        })),

        runways: all.filter(node => node.type === FacilityDataType.RUNWAY).map(r => ({
            ids: [r.rwy_1, r.rwy_2], lat: r.lat, long: r.lon,
            hdg: Math.round(r.heading), length: Math.round(r.lengthFt), width: Math.round(r.widthFt)
        })),

        names: [...names.values()],

        points: [...points.keys()].map(key => {
            const point = points.get(key);

            return [
                Math.round(point?.biasXm),
                Math.round(point?.biasZm),
                point?.orientation,
                point?.pointType
            ]
        }),

        edges: paths.filter((path) => AIRCRAFT_OK.includes(path?.pathType)).map(path => ([
            path.start,
            path.end,
            path.nameIndex,
            path.pathType
        ]))
    };

    return data;
}

const FREQUENCY_TYPES: Record<number, string> = {
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
    15: "GCO"
};

function onFreq(com1: number, freqs: { freqType: number, hz: number, name: string }[]) {
    const hit = freqs.find(f => Math.abs(f.hz  / 1e6 - com1) < 0.006);

    return hit ? {
        role: FREQUENCY_TYPES[hit.freqType],
        hz: hit.hz / 1e6,
        name: hit.name
    } : null;
}

function findFreqs(freqType: number, freqs: { freqType: number, hz: number, name: string }[]) {
    return freqs.filter(f => f.freqType === freqType);
}