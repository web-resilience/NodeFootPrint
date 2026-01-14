export interface CarbonEstimationInput {
    energyJoules:number;
    emissionFactor:number; // grams CO2 per kWh
}

export interface CarbonEstimationResult {
    ok:boolean;
    energy_Kwh?:number;
    carbon_gCO2e?:number;
    reason?:string;
}

const JOULES_PER_KWH = 3.6e6; // 1 kWh = 3.6 million Joules


export function estimateCarbonFootprint(input:CarbonEstimationInput): CarbonEstimationResult {
    const { energyJoules,emissionFactor } = input;
    if(!Number.isFinite(energyJoules) || energyJoules < 0) {
        return {
            ok:false,
            reason:"invalid_energy_joules"
        };
    }

    if(!Number.isFinite(emissionFactor) || emissionFactor < 0) {
        return {
            ok:false,
            reason:"invalid_emission_factor"
        };
    }

    const energy_Kwh = energyJoules / JOULES_PER_KWH;
    const carbon_gCO2e = energy_Kwh * emissionFactor;

    return {
        ok:true,
        energy_Kwh,
        carbon_gCO2e
    };
}