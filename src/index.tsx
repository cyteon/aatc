import { connectSim } from "./sim";
import App from "./ui";
import { withFullScreen } from "fullscreen-ink";

function onUpdate(newState: any) { }

const sim = await connectSim(onUpdate);

const ink = withFullScreen(<App />);
await ink.start();
await ink.waitUntilExit();