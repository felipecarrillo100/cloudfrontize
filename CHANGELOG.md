# Changelog

## [1.3.1](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.3.0...v1.3.1) (2026-03-18)


### Bug Fixes

* WebUI Logo and About Form ([8a49fef](https://github.com/felipecarrillo100/cloudfrontize/commit/8a49fef1983c23ed30f6a7a2186e9a4c55724239))

## [1.3.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.2.0...v1.3.0) (2026-03-18)


### Features

* add WebUI for CloudFrontize ([f773f81](https://github.com/felipecarrillo100/cloudfrontize/commit/f773f81e97260cf1728bc7386da9a6789efc74d1))

## [1.2.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.1.7...v1.2.0) (2026-03-16)

### Features
* implement CFF response cookie serialization ([4bc949a](https://github.com/felipecarrillo100/cloudfrontize/commit/4bc949abe68f836f015db2ecf21909c46295ecd0))

---

## [1.1.7] - 2026-03-16
### Bug Fixes
* **permissions:** update release permissions for automated GitHub Action workflows
* **simulator:** implement missing CFF response cookie serialization logic

## [1.1.6] - 2026-03-15
### Features
* **CFF:** implement CloudFront Function validation for Javascript ES 5.1 compatibility
* **CFF:** add support for injecting custom headers into CFF execution
* **Hot Reload:** implemented terminal notifications for Lambda@Edge and CFF hot reloads
* **Simulator:** improved directory watching with proper cleanup for long-running dev sessions

### Bug Fixes
* **routing:** fix `--mode website` bug where `index.html` was not appended to folder paths
* **headers:** fix handling of Response Headers in simulator and tutorial samples
* **testing:** resolve leak in `e2e_header.test.js` affecting parallel test execution

### Documentation
* **Academy:** fully implemented the CloudFrontize Tutorial (Modules 1-5)
* **Samples:** extended `www` demo and improved `2.2-diplomat.js` and `3.1-bouncer.js` exercises

## [0.9.0] - 2026-03-05
### Features
* **Fidelity:** achieve 100% Lambda@Edge emulation fidelity including hard timeouts and response truncation
* **Fidelity:** added support for Request Body access and proper AWS CloudFront header management
* **Modules:** injected native AWS modules to support `require()` within edge handlers
* **Validation:** enforce strict single-hook-per-type logic and folder existence checks
* **CLI:** added `--mode website | rest` to simulate distinct S3 endpoint behaviors

### Bug Fixes
* **headers:** fix `--headers` option logic and added support for JSON object injection
* **build:** resolved `package.json`, `build.js`, and `cli.js` issues for proper global binary installation
* **routing:** fixed 404/502 error triggers for missing compressed files under `--strict`

## [0.5.0] - 2026-02-28
### Features
* **CFF:** initial support for CloudFront Functions (CFF) and environment variable baking
* **Environment:** implemented support for baked variables and environment variable injection
* **Infrastructure:** added automated test suite (26+ tests) and compression test logic

### Documentation
* **Launch:** added initial `CONTRIBUTING.md`, README, and basic tutorial structure
* **Legal:** added project LICENSE

## [0.1.0] - 2026-02-20
* **Initial Commit:** Basic static file server with Lambda@Edge hook orchestration and initial fidelity improvements.
