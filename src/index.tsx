import App from "./ui";
import { withFullScreen } from "fullscreen-ink";

const ink = withFullScreen(<App />);
await ink.start();
await ink.waitUntilExit();