import fastify from "fastify";

export async function buildServer(shareData: any) {
    const app = fastify({logger: true});

    app.get('/status', async (request, reply) => {
        return {
            status: 'OK',
            timestamp: new Date().toISOString(),
        };
    });

    app.get('/metrics', async (request, reply) => {
        return shareData;
    });

    return app;
}