import App from "./ui";
import { withFullScreen } from "fullscreen-ink";
import { closeSim } from "./sim";

const ink = withFullScreen(<App />);

await ink.start();
await ink.waitUntilExit();
closeSim();