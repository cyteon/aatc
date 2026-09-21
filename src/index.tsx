import App from "./ui";
import { withFullScreen } from "fullscreen-ink";
import { closeSim, trace } from "./sim";

process.on("unhandledRejection", (e: any) => {
  trace("[unhandled rejection]: " + (e?.stack ?? String(e)));
});

process.on("uncaughtException", (e: Error) => {
  trace("[uncaught exception]: " + (e?.stack ?? String(e)));
  process.stdout.write("\x1b[?1049l\x1b[?25h");
  process.exit(1);
});

const ink = withFullScreen(<App />);

await ink.start();
await ink.waitUntilExit();
closeSim();
