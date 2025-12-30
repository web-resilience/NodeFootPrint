import process from "node:process";
import { CpuReader, createEnergyReader, raplProbe,startMainLoop } from "../src/index.js";
import { FastifyInstance } from "fastify";

let shareData: any = {};
let loop: { stop: () => void; tick?: () => Promise<void>; };
let app: FastifyInstance | null = null;

async function closeServer(app: FastifyInstance | null) {
    if (app && typeof app.close === 'function') {
        try {
            await app.close();
            console.log('HTTP server closed.');
        } catch (error) {
            console.error('Error closing HTTP server:', error);
        }
    }
}

async function main() {
    process.stdout.write('NodeFootPrint main loop started. Sharing data via HTTP API.\n');
    process.stdout.write('\n');
    //probe rapl
    const probe = await raplProbe();
    /*
    if (probe.status !== 'OK') {
        console.error('RAPL probe failed:', probe.status, probe.hint);
        return;
    }
    */
    //initialize rapl reader
    const energyReader = createEnergyReader({ probe, log: 'debug' });
    const cpuReader = new CpuReader({});
    //start main loop
    loop = startMainLoop({
        periodMs: 1000,
        samplers: {
            energyReader,
            cpuReader
        },
        shareData,
    });



    const { buildServer } = await import("../src/server/server.js");
    app = await buildServer(shareData);
    const port = 3000;
    try {
        await app.listen({ port });
        console.log(`HTTP server listening on port ${port}`);
    } catch (error) {
        console.error('Error starting HTTP server:', error);
        process.exit(1);
    }
}

process.once('SIGINT', async () => {
    // Optional: clear line / restore cursor first
    loop?.stop();
    await closeServer(app); 
    process.stdout.write('\n');

    console.log('\nGracefully shutting down…');
    process.exit(0); // 0 = success, so no ELIFECYCLE error
});

main().catch(async (error) => {
    console.error('Fatal error in main:', error);
    loop?.stop();
    await closeServer(app);
    process.exit(1);
});