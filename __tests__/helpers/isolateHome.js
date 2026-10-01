// Tests never touch the real ~/.cloudfrontize (recent projects). This runs as Jest's globalSetup, in
// the parent process before workers start, so every worker and every CLI a test spawns inherits it.
// (setupFiles wouldn't do: tests see a copy of process.env that child processes don't inherit.)
const os = require('os');
const path = require('path');

module.exports = async () => {
    process.env.CLOUDFRONTIZE_HOME = path.join(os.tmpdir(), 'cloudfrontize-test-home');
};
