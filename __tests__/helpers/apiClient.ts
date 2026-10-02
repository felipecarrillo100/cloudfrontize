import http from 'http';

/** Test helpers for the WebUI API v2: JSON calls and an event-stream reader. */

type Reply = { status: number; headers: Record<string, any>; body: any; text: string };

export function call(port: number, method: string, path: string, opts: { body?: any; headers?: Record<string, string>; host?: string; raw?: string } = {}): Promise<Reply> {
    return new Promise((resolve, reject) => {
        const payload = opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
        const req = http.request({
            host: opts.host ?? '127.0.0.1', port, method, path,
            headers: { ...(payload !== undefined && opts.raw === undefined ? { 'content-type': 'application/json' } : {}), ...opts.headers }
        }, (res: any) => {
            let text = '';
            res.on('data', (c: Buffer) => { text += c; });
            res.on('end', () => {
                let body: any;
                try { body = text ? JSON.parse(text) : undefined; } catch { body = undefined; }
                resolve({ status: res.statusCode, headers: res.headers, body, text });
            });
        });
        req.on('error', reject);
        if (payload !== undefined) req.write(payload);
        req.end();
    });
}

/** Opens the event stream and collects events until `done(events)` is true. */
export function stream(port: number, headers: Record<string, string> = {}) {
    const events: any[] = [];
    const ids: (number | undefined)[] = [];
    let waiters: Array<() => void> = [];
    let req: any;
    const opened = new Promise<void>((resolve, reject) => {
        req = http.get({ host: '127.0.0.1', port, path: '/api/v2/events', headers }, (res: any) => {
            let buffer = '';
            res.on('data', (chunk: Buffer) => {
                buffer += chunk;
                let i;
                while ((i = buffer.indexOf('\n\n')) >= 0) {
                    const block = buffer.slice(0, i);
                    buffer = buffer.slice(i + 2);
                    const data = block.split('\n').find(l => l.startsWith('data: '));
                    const id = block.split('\n').find(l => l.startsWith('id: '));
                    if (!data) continue;
                    events.push(JSON.parse(data.slice(6)));
                    ids.push(id ? Number(id.slice(4)) : undefined);
                    waiters.forEach(w => w());
                }
            });
            resolve();
        });
        req.on('error', reject);
    });
    const until = (done: (e: any[]) => boolean, ms = 5000) => new Promise<any[]>((resolve, reject) => {
        const check = () => { if (done(events)) { waiters = waiters.filter(w => w !== check); clearTimeout(timer); resolve(events); } };
        const timer = setTimeout(() => reject(new Error(`timed out; got ${events.map(e => e.type).join(', ')}`)), ms);
        waiters.push(check);
        check();
    });
    return { events, ids, opened, until, close: () => req.destroy() };
}

export const get = (port: number, path: string) => new Promise<number>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res: any) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
});

