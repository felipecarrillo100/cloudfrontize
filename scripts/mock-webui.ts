import { Telemetry } from '../src/pipeline/Telemetry';
import { Orchestrator } from '../src/pipeline/Orchestrator';
import { WebUI } from '../src/pipeline/WebUI';

const tel = new Telemetry();
const mockConfig = {
    origins: [{ id: 's3-origin', type: 's3', bucket: 'test' }],
    edge: 'tutorial/solutions/1.2-librarian.js',
    hooks: [
        { type: 'Lambda@Edge', path: '1.2-librarian.js', code: 'console.log("L@E Librarian");' },
        { type: 'CloudFront Functions', path: 'viewer-request.js', code: 'console.log("CFF Viewer Req");' },
        { type: 'CloudFront Functions', path: 'viewer-response.js', code: 'console.log("CFF Viewer Res");' }
    ]
};

const orchid = new Orchestrator(null, null, {}, [], tel, mockConfig);
const port = parseInt(process.argv[2] || '3007');

// WebUI starts its own server in constructor on the provided port
new WebUI(tel, orchid, { port });

console.log(`Mock WebUI running at http://localhost:${port}`);

const reqId = 'mock-multi';
setTimeout(() => {
    tel.broadcast({ id: reqId, type: 'request', details: { method: 'GET', url: '/assets/multi.png', headers: { host: 'localhost' } } });
    tel.broadcast({ id: reqId, type: 'stage', details: { name: 'Viewer Request (CFF)' } });
    tel.broadcast({ id: reqId, type: 'stage', details: { name: 'Viewer Request (L@E)' } });
    tel.broadcast({ id: reqId, type: 'stage', details: { name: 'Origin Fetch', origin: 's3-origin' } });
    tel.broadcast({ id: reqId, type: 'stage', details: { name: 'Origin Response', status: 200, headers: { 'x-mock': 'multi', 'x-header-1': 'val1', 'x-header-2': 'val2', 'x-header-3': 'val3' } } });
    tel.broadcast({ id: reqId, type: 'stage', details: { name: 'Viewer Response (CFF)' } });
    tel.broadcast({ id: reqId, type: 'response', durationMs: 123, details: { status: 200, headers: { 'content-type': 'image/png' } } });
}, 1000);
