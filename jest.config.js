module.exports = {
    rootDir: './',
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
    verbose: true,
    forceExit: true,
    detectOpenHandles: true
};
