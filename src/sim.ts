import { open, Protocol, SimConnectConnection, SimConnectConstants, SimConnectDataType, SimConnectPeriod } from "node-simconnect";
import { appendFileSync } from "node:fs";

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

let activeClose: (() => void) | undefined;
export function closeSim() {
    activeClose?.();
}

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

    let state = {};

    handle.on("simObjectData", (e) => {
        let patch = {};

        if (e.requestID === FLOATS_ID) {
            for (const [key] of FLOATS) {
                let value: any = e.data.readFloat64();

                if (key === "onGround") value = value != 0;
                if (key === "com1") value = decodeBcd16(value);

                patch[key] = value;
            }
        }

        if (e.requestID === STRINGS_ID) {
            for (const [key, , , reader] of STRINGS) {
                patch[key] = e.data[reader]().trim();
            }
        }

        state = { ...state, ...patch };
        onUpdate(state);
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

function decodeBcd16(raw) {
    const d = Math.round(raw).toString(16).padStart(4, "0");
    return raw > 0 ? parseFloat(`1${d.slice(0, 2)}.${d.slice(2)}`) : 0;
}