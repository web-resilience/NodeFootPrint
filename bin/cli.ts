import process from "node:process";
import { CpuReader, createEnergyReader, ProcessCpuReader, raplProbe,startMainLoop } from "../src/index.js";
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

function parseArgs(argv: string[]) {
    // Simple argument parser
    const args: { [key: string]: string | boolean } = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const nextArg = argv[i + 1];
            if (nextArg && !nextArg.startsWith('--')) {
                args[key] = nextArg;
                i++;
            } else {
                args[key] = true;
            }
        }
    }
    return args;
}

async function main(argv: string[] = process.argv.slice(2)) {
    process.stdout.write('NodeFootPrint main loop started. Sharing data via HTTP API.\n');
    process.stdout.write('\n');

    const args = parseArgs(argv);

    const { help,output, pid = process.pid, port = 3000, flush = false, periodMs = 1000,sws = 10 } = args;

    const PID = Number(pid);

    if (help) {
        process.stdout.write('Usage: node cli.js [--help] [--port <port>]\n');
        process.stdout.write('--help          Show this help message\n');
        process.stdout.write('--output <output.json>   Specify the output path for jsonl (default: ./)\n');
        process.exit(0);
    }
    //probe rapl
    const probe = await raplProbe();
    /*
    if (probe.status !== 'OK') {
        console.error('RAPL probe failed:', probe.status, probe.hint);
        return;
    }
    */
    //initialize reader
    const energyReader = createEnergyReader({ probe, log: 'debug' });
    const cpuReader = new CpuReader({});
    const processCpuReader = new ProcessCpuReader({
        pid: PID,
        log: 'debug',
    });
    //start main loop
    loop = await startMainLoop({
        periodMs: Number(periodMs) ?? 1000,
        slidingWindowSize: Number(sws) ?? 10,
        samplers: {
            energyReader,
            cpuReader,
            processCpuReader
        },
        shareData,
        output:{
            path:output ? String(output) : undefined,
            flush:flush === true
        }
    });



    const { buildServer } = await import("../src/server/server.js");
    app = await buildServer(shareData);
    const PORT = port || 3000;
    try {
        await app.listen({ port: Number(PORT), host: '0.0.0.0' });
        console.log(`HTTP server listening on port ${PORT}`);
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