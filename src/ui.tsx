import { Box, Text, useApp } from "ink";
import { useEffect } from "react";

export default function App() {
    const { exit } = useApp();

    useEffect(() => {
        process.stdout.write('\x1b[?25l');

        return () => {
            process.stdout.write('\x1b[?25h');
        };
    }, []);

    return (
        <Box flexDirection="column">
            <Text>hi</Text>
        </Box>
    )
}