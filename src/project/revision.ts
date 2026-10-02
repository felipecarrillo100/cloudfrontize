import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * A file's revision: a short hash of its exact bytes. Clients send back the revision they edited, so
 * a save can be refused when the file changed in the meantime (in an editor, git, another tab...).
 */
export function revisionOf(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Reads a file with its revision. */
export function readRevisioned(file: string): { content: string; revision: string } {
    const content = fs.readFileSync(file, 'utf8');
    return { content, revision: revisionOf(content) };
}

/**
 * Writes a file atomically (a temporary file in the same folder, then a rename), so readers and
 * watchers never see a half-written file. Returns the new revision.
 */
export function writeFileAtomic(file: string, content: string): string {
    const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
    try {
        fs.writeFileSync(temp, content);
        fs.renameSync(temp, file);
    } catch (err) {
        fs.rmSync(temp, { force: true });
        throw err;
    }
    return revisionOf(content);
}

/** Manifests are written as 2-space JSON with a trailing newline, like `cloudfrontize init`. */
export const formatManifest = (manifest: unknown) => JSON.stringify(manifest, null, 2) + '\n';
