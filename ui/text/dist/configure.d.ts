import type { GooseClient } from "@aaif/goose-sdk";
export type ConfigureIntent = "provider" | "model";
interface ConfigureProps {
    client: GooseClient;
    sessionId: string;
    width: number;
    height: number;
    onComplete: () => void;
    onCancel: () => void;
    initialIntent?: ConfigureIntent;
}
export default function ConfigureScreen({ client, sessionId, width, height, onComplete, onCancel, initialIntent, }: ConfigureProps): import("react/jsx-runtime").JSX.Element;
export {};
