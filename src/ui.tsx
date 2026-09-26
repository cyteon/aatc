import { Box, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import { connectSim } from "./sim";
import { useScreenSize } from "fullscreen-ink";
import { createAtc } from "./atc";

const OTHER_ROWS = 5;

function fitLog(
  log: { sender: string; message: string }[],
  rows: number,
  width: number,
) {
  const out = [];
  let used = 0;

  for (let i = log.length - 1; i >= 0; i--) {
    const length = log[i]!.sender.length + log[i]!.message.length + 3;
    const lines = Math.max(1, Math.ceil(length / width));

    if (used + lines > rows) break;
    out.unshift(log[i]);
    used += lines;
  }

  return out;
}

export default function App() {
  const { exit } = useApp();

  useEffect(() => {
    process.stdout.write("\x1b[?25l");

    return () => {
      process.stdout.write("\x1b[?25h");
    };
  }, []);

  const [state, setState] = useState(null);

  useEffect(() => {
    connectSim(setState).catch((e) => {
      setState({ simError: e.message });
    });
  }, []);

  useEffect(() => {
    if (!state) return;

    atc.tick(state)?.then((response) => {
      if (!response) return;

      setLog((log) => [
        ...log,
        { sender: response.facility, message: response.message },
      ]);
    });
  }, [state]);

  const [atc] = useState(() => createAtc());

  const [log, setLog] = useState<{ sender: string; message: string }[]>([]);
  const [input, setInput] = useState("");

  function handleSubmit() {
    if (!input.trim() || !state) return;
    const text = input.trim();

    setLog([...log, { sender: "You", message: input }]);
    setInput("");

    atc.send(text, state).then((response) => {
      if (!response) return;

      setLog((log) => [
        ...log,
        { sender: response.facility, message: response.message },
      ]);
    });
  }

  const { height, width } = useScreenSize();
  const visible = fitLog(log, height - OTHER_ROWS, width);

  return (
    <Box flexDirection="column" width="100%">
      <Box backgroundColor="#4169E1" paddingX={1} flexDirection="column">
        <Box>
          <Box marginRight={2}>
            <Text color="#0B1026">CALLSIGN </Text>
            <Text bold>{state?.callsign ?? "---"}</Text>
          </Box>

          <Box marginRight={2}>
            <Text color="#0B1026">SQUAWK </Text>
            <Text bold>{state?.squawk ?? "---"}</Text>
          </Box>

          <Box>
            <Text color="#0B1026">COM1 </Text>
            <Text bold>
              {state?.com1 ?? "---"} (
              {atc.getFacility(state)?.name ?? "no contact"})
            </Text>
          </Box>

          {state?.simError && (
            <Box marginLeft={2}>
              <Text color="red">ERROR </Text>
              <Text bold>{state.simError}</Text>
            </Box>
          )}
        </Box>

        <Box>
          <Box marginRight={2}>
            <Text color="#0B1026">ALT </Text>
            <Text bold>
              {state?.indicatedAlt ? Math.round(state?.indicatedAlt) : "---"}
              {state?.indicatedAlt ? "ft" : ""}
            </Text>
          </Box>

          <Box marginRight={2}>
            <Text color="#0B1026">HDG </Text>
            <Text bold>
              {state?.magHeading ? Math.round(state?.magHeading) : "---"}
              {state?.magHeading ? "°" : ""}
            </Text>
          </Box>

          <Box>
            <Text color="#0B1026">IAS </Text>
            <Text bold>
              {state?.iasKt ? Math.round(state?.iasKt) : "---"}
              {state?.iasKt ? "kt" : ""}
            </Text>
          </Box>
        </Box>
      </Box>

      <Box
        flexDirection="column"
        flexGrow={1}
        justifyContent="flex-end"
        marginY={1}
        overflow="none"
      >
        {visible.map((m, i) => (
          <Box key={i}>
            <Text color={m.sender === "You" ? "white" : "yellowBright"}>
              [{m.sender}] {m.message}
            </Text>
          </Box>
        ))}
      </Box>

      <Box flexShrink={0}>
        <Text color="#4169E1">transmit&gt; </Text>
        <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
}
