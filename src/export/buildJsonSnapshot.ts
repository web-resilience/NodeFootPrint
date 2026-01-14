export function buildJsonSnapshot(data: any) {
    return {
        timestamp:data.timestamp,
        intervalSeconds:data.intervalSeconds,
        host: {
            cpu: data.cpu.cpuTicks ?? null,
            energy: data.rapl ? {
                unit: "joules",
                delta: data.rapl.hostEnergyJoules.value,
                perPackage: data.rapl.perPackage,
                meta: data.rapl.meta
            } : null
        },
        process: data.process ?? null,
        carbon: data.carbon ?? null
    };
}