import React from "react";
import type { GooseClient, ProviderInventoryEntryDto } from "@aaif/goose-sdk";
interface OnboardingProps {
    client: GooseClient;
    width: number;
    height: number;
    onComplete: () => void;
}
export interface ProviderSelectorProps {
    providers: ProviderInventoryEntryDto[];
    height: number;
    onSelect: (provider: ProviderInventoryEntryDto) => void;
    title?: string;
    subtitle?: string;
    onBack?: () => void;
}
export declare const ProviderSelector: React.NamedExoticComponent<ProviderSelectorProps>;
export interface ProviderConfiguratorProps {
    provider: ProviderInventoryEntryDto;
    height: number;
    onComplete: (values: Record<string, string>) => void;
    onBack: () => void;
}
export declare const ProviderConfigurator: React.NamedExoticComponent<ProviderConfiguratorProps>;
export default function Onboarding({ client, width, height, onComplete, }: OnboardingProps): import("react/jsx-runtime").JSX.Element;
export {};
