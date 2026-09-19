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
    
    useEffect(() => {
        connectSim(setState).catch((e) => {
            setState({ simError: e.message });
        });
    },  []);

    return (
        <Box flexDirection="column">
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
                        <Text bold>{parseInt(state?.indicatedAlt!) ?? "---"}ft</Text>
                    </Box>

                    <Box marginRight={2}>
                        <Text color="#0B1026">HDG </Text>
                        <Text  bold>{parseInt(state?.magHeading!) ?? "---"}</Text>
                    </Box>

                    <Box>
                        <Text color="#0B1026">IAS </Text>
                        <Text  bold>{parseInt(state?.iasKt!) ?? "---"}kt</Text>
                    </Box>
                </Box>
            </Box>
        </Box>
    )
}