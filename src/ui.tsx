import { Box, Text, useApp } from "ink";
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
    const sim = connectSim(setState);

    return (
        <Box flexDirection="column">
            <Box backgroundColor="#4169E1" paddingX={1} flexDirection="column">
                <Box>
                    <Box flexGrow={1} marginRight={2}>
                        <Text color="#0B1026">CALLSIGN </Text>
                        <Text bold>{state?.callsign ?? "---"}</Text>
                    </Box>

                    <Box flexGrow={1} marginRight={2}>
                        <Text color="#0B1026">COM1 </Text>
                        <Text  bold>{state?.com1 ?? "---"}</Text>
                    </Box>

                    <Box flexGrow={1}>
                        <Text color="#0B1026">SQUAWK </Text>
                        <Text  bold>{state?.squawk ?? "---"}</Text>
                    </Box>
                </Box>

                <Box>
                    <Box flexGrow={1} marginRight={2}>
                        <Text color="#0B1026">ALT </Text>
                        <Text bold>{parseInt(state?.indicatedAlt!) ?? "---"}ft</Text>
                    </Box>

                    <Box flexGrow={1} marginRight={2}>
                        <Text color="#0B1026">HDG </Text>
                        <Text  bold>{parseInt(state?.magHeading!) ?? "---"}</Text>
                    </Box>

                    <Box flexGrow={1}>
                        <Text color="#0B1026">IAS </Text>
                        <Text  bold>{parseInt(state?.iasKt!) ?? "---"}kt</Text>
                    </Box>
                </Box>
            </Box>
        </Box>
    )
}