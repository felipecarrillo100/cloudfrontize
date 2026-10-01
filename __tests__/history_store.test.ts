export {};
const http = require('http');
const { InMemoryHistoryStore, NullHistoryStore, estimateSize } = require('../src/pipeline/HistoryStore');
const { Telemetry } = require('../src/pipeline/Telemetry');
const { createServer } = require('../src/server/createServer');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

// Traffic history: bounded by count and memory; not kept at all without a WebUI
const event = (id: string, body = '') => ({ id, timestamp: 't', type: 'stage', details: { body } });

describe('history', () => {
    test('the oldest requests go first when the memory budget is exceeded', () => {
        const store = new InMemoryHistoryStore(5000, 10_000);
        for (let i = 0; i < 5; i++) store.add(event(`r${i}`, 'x'.repeat(3000)));
        expect(store.getIds()).toEqual(['r2', 'r3', 'r4']);
        expect(store.size).toBeLessThanOrEqual(10_000);
        expect(store.getById('r0')).toEqual([]);
    });

    test('the newest request stays even when it alone exceeds the budget', () => {
        const store = new InMemoryHistoryStore(5000, 1000);
        store.add(event('small'));
        store.add(event('big', 'x'.repeat(5000)));
        store.add(event('big', 'y'));
        expect(store.getIds()).toEqual(['big']);
        expect(store.getById('big')).toHaveLength(2);
    });

    test('the count limit still applies, and clear() resets the size', () => {
        const store = new InMemoryHistoryStore(2);
        ['a', 'b', 'c'].forEach(id => store.add(event(id)));
        expect(store.getIds()).toEqual(['b', 'c']);
        store.clear();
        expect(store.size).toBe(0);
        expect(store.getIds()).toEqual([]);
    });

    test('sizes are estimated from the strings an event holds', () => {
        expect(estimateSize({ a: 'x'.repeat(1000) })).toBeGreaterThanOrEqual(1000);
        expect(estimateSize({ a: 'x'.repeat(1000) })).toBeLessThan(1100);
    });

    test('a server without a WebUI keeps no history and takes no body snapshots', async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        const dir = makeProject(baseManifest(), WWW);
        const server = await createServer({ project: dir, port: 0, noBanner: true, requestLogging: false });
        try {
            const telemetry = server.current.orchestrator.telemetry; // (private in TypeScript)
            expect(telemetry.recording).toBe(false);
            const stages: any[] = [];
            const broadcast = telemetry.broadcast.bind(telemetry);
            telemetry.broadcast = (e: any) => { stages.push(e); broadcast(e); };
            await new Promise<void>(resolve => http.get(`http://127.0.0.1:${server.address().port}/`, (r: any) => { r.resume(); r.on('end', () => resolve()); }));
            expect(telemetry.getIds()).toEqual([]);
            expect(stages.length).toBeGreaterThan(0);
            expect(stages.some(e => e.details?.body !== undefined)).toBe(false);
        } finally {
            await server.closeGracefully();
            removeProject(dir);
            jest.restoreAllMocks();
        }
    });

    test('with a WebUI it records', () => {
        expect(new Telemetry(new InMemoryHistoryStore()).recording).toBe(true);
        expect(new Telemetry(new NullHistoryStore()).recording).toBe(false);
    });
});
