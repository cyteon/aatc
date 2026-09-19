import { open, Protocol, SimConnectConnection, SimConnectConstants, SimConnectDataType, SimConnectPeriod, FacilityDataType } from "node-simconnect";
import { appendFileSync } from "node:fs";
import { structureAirportData } from "./utils/airports";

const trace = (msg: string) => appendFileSync("sim.log", msg + "\n");
trace("sim log started");

const FLOATS = [
    [ "latitude", "PLANE LATITUDE", "degrees" ],
    [ "longitude", "PLANE LONGITUDE", "degrees" ],
    [ "indicatedAlt", "INDICATED ALTITUDE", "feet" ],
    [ "aglAlt", "PLANE ALT ABOVE GROUND", "feet" ],
    [ "magHeading", "PLANE HEADING DEGREES MAGNETIC", "degrees" ],
    [ "iasKt", "AIRSPEED INDICATED", "knots" ],
    [ "vsFpm", "VERTICAL SPEED", "feet per minute" ],
    [ "onGround", "SIM ON GROUND", "bool" ],
    [ "com1", "COM ACTIVE FREQUENCY:1", "frequency bcd16" ],
    [ "squawk", "TRANSPONDER CODE:1", "number" ],
    [ "windDir", "AMBIENT WIND DIRECTION", "degrees" ],
    [ "windKt", "AMBIENT WIND VELOCITY", "knots" ]
];

const STRINGS = [
    [ "callsign", "ATC FLIGHT NUMBER", SimConnectDataType.STRING32, "readString32" ]
];

const FLOATS_ID = 1;
const STRINGS_ID = 2;

const FACILITY_ID = 100;
let facility_field_ids = new Map<number, string>();

let activeClose: (() => void) | undefined;
export function closeSim() {
    activeClose?.();
}

const RUNWAY_DESIGNATORS = ["", "L", "R", "C", "W", "A", "B"];

export async function connectSim(onUpdate: (newState: any) => void) {
    let handle: SimConnectConnection | undefined;

    try {
        handle = (await open("atc-node", Protocol.KittyHawk)).handle;
    } catch (err) {
        if (err instanceof AggregateError) {
            trace(`simconnect connection errors:\n${(err as AggregateError).errors.map(e => "- " + e.message).join("\n")}`);
            onUpdate({ simError: "simconnect connection failed" });
            return;
        }

        trace(`simconnect connection failed: ${(err as Error).message}`);
        onUpdate({ simError: (err as Error).message });
        return;
    }

    for (const [, name, units] of FLOATS) {
        handle.addToDataDefinition(FLOATS_ID, name as string, units!, SimConnectDataType.FLOAT64);
    }

    for (const [, name, type] of STRINGS) {
        handle.addToDataDefinition(STRINGS_ID, name as string, null, type as SimConnectDataType);
    }

    handle.requestDataOnSimObject(FLOATS_ID, FLOATS_ID, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SECOND);
    handle.requestDataOnSimObject(STRINGS_ID, STRINGS_ID, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SECOND, 0, 0, 5);

    [
        "OPEN AIRPORT",
            "LATITUDE", "LONGITUDE", "ALTITUDE", "ICAO",

            "OPEN FREQUENCY",
                "TYPE", "FREQUENCY", "NAME",
            "CLOSE FREQUENCY",

            "OPEN RUNWAY",
                "LATITUDE", "LONGITUDE", "HEADING", "LENGTH", "WIDTH",
                "PRIMARY_NUMBER", "SECONDARY_NUMBER",
                "PRIMARY_DESIGNATOR", "SECONDARY_DESIGNATOR",
            "CLOSE RUNWAY",

            "OPEN TAXI_POINT",
                "TYPE", "ORIENTATION", "BIAS_X", "BIAS_Z",
            "CLOSE TAXI_POINT",

            "OPEN TAXI_NAME",
                "NAME",
            "CLOSE TAXI_NAME",

            "OPEN TAXI_PATH",
                "TYPE", "START", "END", "WIDTH", "NAME_INDEX",
            "CLOSE TAXI_PATH",
        "CLOSE AIRPORT"
    ].forEach((name) => {
        facility_field_ids.set(handle.addToFacilityDefinition(FACILITY_ID, name), name);
    });

    let state = {};

    handle.on("simObjectData", (e) => {
        let patch: Record<string, any> = {};

        if (e.requestID === FLOATS_ID) {
            for (const [key] of FLOATS) {
                let value: any = e.data.readFloat64();

                if (key === "onGround") value = value != 0;
                if (key === "com1") value = decodeBcd16(value);

                patch[key as string] = value;
            }
        }

        if (e.requestID === STRINGS_ID) {
            for (const [key, , , reader] of STRINGS) {
                patch[key as string] = e.data[reader]().trim();
            }
        }

        state = { ...state, ...patch };
        onUpdate(state);
    });

    let facility_nodes = new Map<number, any>();

    handle.on("facilityData", (e) => {
        if (e.userRequestId !== FACILITY_ID) return;

        const node: any = { type: e.type, children: [] };

        if (e.type === FacilityDataType.AIRPORT) {
            node.lat = e.data.readFloat64();
            node.long = e.data.readFloat64();
            node.alt = e.data.readFloat64() * 3.28084;
            node.icao = e.data.readString8();
        } else if (e.type === FacilityDataType.FREQUENCY) {
            node.freqType = e.data.readInt32();
            node.hz = e.data.readInt32();
            node.name = e.data.readString64();
        } else if (e.type === FacilityDataType.RUNWAY) {
            node.lat = e.data.readFloat64();
            node.lon = e.data.readFloat64();
            node.heading = e.data.readFloat32();
            node.lengthFt = e.data.readFloat32() * 3.28084;
            node.widthFt = e.data.readFloat32() * 3.28084;

            let primaryNumber = e.data.readInt32();
            let secondaryNumber = e.data.readInt32();

            let primaryDesignator = e.data.readInt32();
            let secondaryDesignator = e.data.readInt32();

            let rwy_1 = primaryNumber >= 1 && primaryNumber <= 36 ? String(primaryNumber).padStart(2, "0") + RUNWAY_DESIGNATORS[primaryDesignator] : "";
            let rwy_2 = secondaryNumber >= 1 && secondaryNumber <= 36 ? String(secondaryNumber).padStart(2, "0") + RUNWAY_DESIGNATORS[secondaryDesignator] : "";

            node.rwy_1 = rwy_1;
            node.rwy_2 = rwy_2;
        } else if (e.type === FacilityDataType.TAXI_POINT) {
            node.pointType = e.data.readInt32();
            node.orientation = e.data.readInt32();
            node.biasXm = e.data.readFloat32();
            node.biasZm = e.data.readFloat32();
            node.index = e.itemIndex;
        } else if (e.type === FacilityDataType.TAXI_NAME) {
            node.name = e.data.readString32();
            node.index = e.itemIndex;
        } else if (e.type === FacilityDataType.TAXI_PATH) {
            node.pathType = e.data.readInt32();
            node.start = e.data.readInt32();
            node.end = e.data.readInt32();
            node.widthFt = e.data.readFloat32() * 3.28084;
            node.nameIndex = e.data.readUint32();
        }

        facility_nodes.set(e.uniqueRequestId, node);
        
        if (e.uniqueRequestId !== e.parentUniqueRequestId) {
            facility_nodes.get(e.parentUniqueRequestId)?.children.push(node);
        }
    });

    handle.on("facilityDataEnd", (e) => {
        const data = structureAirportData(facility_nodes);
        facility_nodes.clear();
    });

    handle.on("exception", (err) => {
        trace(`simconnect exception: ${err.exceptionName}`);
        onUpdate({ ...state, simError: err.exceptionName });
    });

    handle.on("error", (err) => {
        trace(`simconnect error: ${err.message}`);
        onUpdate({ ...state, simError: err.message });
    });

    handle.on("quit", () => {
        trace("simconnect quit");
        onUpdate({ ...state, simError: "simulator closed" })
    });

    function close() {
        handle?.requestDataOnSimObject(FLOATS_ID, FLOATS_ID, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.NEVER);
        handle?.requestDataOnSimObject(STRINGS_ID, STRINGS_ID, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.NEVER);

        handle?.clearDataDefinition(FLOATS_ID);
        handle?.clearDataDefinition(STRINGS_ID);

        handle?.close();
    }

    activeClose = close;
}

function decodeBcd16(raw: number) {
    const d = Math.round(raw).toString(16).padStart(4, "0");
    return raw > 0 ? parseFloat(`1${d.slice(0, 2)}.${d.slice(2)}`) : 0;
}