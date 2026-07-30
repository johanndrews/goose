import React from "react";
import type { ResumableSession } from "../sessions.js";
interface SessionPickerProps {
    sessions: ResumableSession[];
    cwd: string;
    width: number;
    height: number;
    escapeAction: "new session" | "cancel";
    onSelect: (session: ResumableSession) => void;
    onCancel: () => void;
}
export declare const SessionPicker: React.NamedExoticComponent<SessionPickerProps>;
export {};
