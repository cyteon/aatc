import { open, Protocol, SimConnectConstants, SimConnectDataType, SimConnectPeriod } from "node-simconnect";

const VARIABLES = [
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

const DEF = 1, REQ = 1;

export async function connectSim(onUpdate) {
    const { handle } = await open("atc-node", Protocol.KittyHawk);

    for (const [, name, units] of VARIABLES) {
        handle.addToDataDefinition(DEF, name!, units!, SimConnectDataType.FLOAT64);
    }

    handle.requestDataOnSimObject(REQ, DEF, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SECOND);

    handle.on("simObjectData", (e) => {
        const state = {};

        for (const [key] of VARIABLES) {
            let value: any = e.data.readFloat64();

            if (key === "onGround") value = value != 0;
            // todo: decoder for com1 and squawk

            state[key] = value;
        }

        console.log(state);

        onUpdate(state);
    });

    handle.on("exception", (err) => console.log(`msfs exception: ${err.exceptionName}`));
    handle.on("quit", () => console.log("msfs kaboom"));
}