import { readFile } from "fs/promises";
import { extractErrorCode } from "@nodefootprint/shared";

export interface AppConfig {
    emissionFactor?: {
        country: string;
        factor: number;
    },
    fallback?: {
        pidleWatts: number;
        pmaxWatts: number;
        tdpWatts: number;
        idleFraction: number;
        maxFraction: number;
    }
}

export async function loadConfig(configPath: string): Promise<AppConfig | undefined> {
    try {

        const raw = await readFile(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) {
            throw new Error("--config: invalid JSON object");
        }
        return parsed as AppConfig;

    } catch (error) {
        const code = extractErrorCode(error);
        if (code === 'ENOENT') throw new Error(`[--config]: no such file ${configPath}`);
    }
}