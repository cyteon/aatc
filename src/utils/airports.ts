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
            freqType: f.freqType,
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