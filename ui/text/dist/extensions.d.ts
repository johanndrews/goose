import type { GooseClient } from "@aaif/goose-sdk";
export default function ExtensionsManager({ client, sessionId, height, onClose, }: {
    client: GooseClient;
    sessionId: string;
    height: number;
    onClose: () => void;
}): import("react/jsx-runtime").JSX.Element;
