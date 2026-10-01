module.exports = {
    rootDir: './',
    // Tests live in __tests__/ only (src/runtime/spec.ts is source, not a test)
    testMatch: ['<rootDir>/__tests__/**/*.test.[jt]s'],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/tmp_test/',
        '/dist/'
    ],
    clearMocks: true,
    transform: {
        '^.+\\.(t|j)sx?$': 'babel-jest',
    },
    testEnvironment: 'node',
    // Keep tests away from the real ~/.cloudfrontize
    globalSetup: '<rootDir>/__tests__/helpers/isolateHome.js',
    verbose: true,
    forceExit: true,
    detectOpenHandles: true
};
