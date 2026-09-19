import { Box, Static, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import { connectSim } from "./sim";

export default function App() {
    const { exit } = useApp();

    useEffect(() => {
        process.stdout.write('\x1b[?25l');

        return () => {
            process.stdout.write('\x1b[?25h');
        };
    }, []);

    const [state, setState] = useState(null);
    
    useEffect(() => {
        connectSim(setState).catch((e) => {
            setState({ simError: e.message });
        });
    },  []);

    const [log, setLog] = useState<{ sender: string, message: string }[]>([]);

    const [input, setInput] = useState("");

    function handleSubmit() {
        setLog([...log, { sender: "You", message: input }]);
        setInput("");
    }

    return (
        <Box flexDirection="column" width="100%">
            <Box backgroundColor="#4169E1" paddingX={1} flexDirection="column">
                <Box>
                    <Box marginRight={2}>
                        <Text color="#0B1026">CALLSIGN </Text>
                        <Text bold>{state?.callsign ?? "---"}</Text>
                    </Box>

                    <Box marginRight={2}>
                        <Text color="#0B1026">COM1 </Text>
                        <Text  bold>{state?.com1 ?? "---"}</Text>
                    </Box>

                    <Box>
                        <Text color="#0B1026">SQUAWK </Text>
                        <Text  bold>{state?.squawk ?? "---"}</Text>
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
                        <Text bold>{state?.indicatedAlt ? Math.round(state?.indicatedAlt) : "---"}{state?.indicatedAlt ? "ft" : ""}</Text>
                    </Box>

                    <Box marginRight={2}>
                        <Text color="#0B1026">HDG </Text>
                        <Text  bold>{state?.magHeading ? Math.round(state?.magHeading) : "---"}{state?.magHeading ? "°" : ""}</Text>
                    </Box>

                    <Box>
                        <Text color="#0B1026">IAS </Text>
                        <Text  bold>{state?.iasKt ? Math.round(state?.iasKt) : "---"}{state?.iasKt ? "kt" : ""}</Text>
                    </Box>
                </Box>
            </Box>

            <Box flexDirection="column" flexGrow={1} justifyContent="flex-end" marginY={1}>
                {log.map((m, i) => (
                    <Box key={i}>
                        <Text color={m.sender === "You" ? "white" : "yellowBright"}>[{m.sender}] {m.message}</Text>
                    </Box>
                ))}
            </Box>

            <Box flexShrink={0}>
                <Text color="#4169E1">transmit&gt; </Text>
                <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
            </Box>
        </Box>
    )
}