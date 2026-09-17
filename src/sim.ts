import { open, Protocol, SimConnectConstants, SimConnectDataType, SimConnectPeriod } from "node-simconnect";

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
const STRINGS_ID = 1;

export async function connectSim(onUpdate: (newState: any) => void) {
    const { handle } = await open("atc-node", Protocol.KittyHawk);

    for (const [, name, units] of FLOATS) {
        handle.addToDataDefinition(FLOATS_ID, name as string, units!, SimConnectDataType.FLOAT64);
    }

    for (const [, name, type] of STRINGS) {
        handle.addToDataDefinition(STRINGS_ID, name as string, null, type as SimConnectDataType);
    }

    handle.requestDataOnSimObject(FLOATS_ID, FLOATS_ID, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SECOND);
    handle.requestDataOnSimObject(STRINGS_ID, STRINGS_ID, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SECOND, 0, 0, 5);

    handle.on("simObjectData", (e) => {
        const state = {};

        if (e.requestID === FLOATS_ID) {
            for (const [key] of FLOATS) {
                let value: any = e.data.readFloat64();

                if (key === "onGround") value = value != 0;
                if (key === "com1") value = decodeBcd16(value);

                state[key] = value;
            }
        }

        if (e.requestID === STRINGS_ID) {
            for (const [key, , , reader] of STRINGS) {
                state[key] = e.data[reader]().trim();
            }
        }

        console.log(state);
        onUpdate(state);
    });

    handle.on("exception", (err) => console.log(`msfs exception: ${err.exceptionName}`));
    handle.on("quit", () => console.log("msfs kaboom"));
}

function decodeBcd16(raw) {
    const d = Math.round(raw).toString(16).padStart(4, "0");
    return raw > 0 ? parseFloat(`1${d.slice(0, 2)}.${d.slice(2)}`) : 0;
}