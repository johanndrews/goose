import React from "react";
interface HeaderProps {
    width: number;
    status: string;
    loading: boolean;
    spinIdx: number;
    providerId?: string | null;
    modelId?: string | null;
    turnInfo?: {
        current: number;
        total: number;
    };
}
export declare const Header: React.NamedExoticComponent<HeaderProps>;
export {};
