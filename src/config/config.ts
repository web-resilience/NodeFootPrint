import { readFile } from "fs/promises";

export interface AppConfig {
    emissionFactor?:{
        country:string;
        factor:number;
    },
    fallback?:{
        pidleWatts:number;
        pmaxWatts:number;
        tdpWatts:number;
        idleFraction:number;
        maxFraction:number;
    }
}

export async function loadConfig(configPath:string):Promise<AppConfig> {
        const raw = await readFile(configPath,'utf-8');
        const parsed = JSON.parse(raw);

        if(typeof parsed !== "object" || parsed === null) {
            throw new Error("--config: invalid JSON object");
        }

        return parsed as AppConfig;
}