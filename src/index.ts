import { connectSim } from "./sim";

function onUpdate(newState: any) {
    console.log(newState);
}

const sim = await connectSim(onUpdate);