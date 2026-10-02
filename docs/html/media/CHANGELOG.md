# Changelog

## [2.2.1](https://github.com/felipecarrillo100/cloudfrontize/compare/v2.2.0...v2.2.1) (2026-09-30)


### Bug Fixes

* **cli:** `--output` without a directory now writes the baked files; it previously reported success and wrote nothing. A function that fails to build now exits with an error instead of reporting success.
* **webui:** `--webui` without a port no longer crashes the server; it defaults to the main port + 1. An invalid port is rejected with a clear error.
* **webui:** S3 origin credentials (`accessKeyId`, `secretAccessKey`, `sessionToken`) are no longer sent to the WebUI; `/api/distribution` and the live event stream show only that credentials are configured.

## [2.2.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v2.1.0...v2.2.0) (2026-09-30)

AWS fidelity release: limits and rules re-checked against the current CloudFront Developer Guide (quotas and edge-function restrictions). Some results change in default mode too — see **Behavior changes**.


### Features

* **headers:** header rules follow AWS's per-event tables: disallowed headers (e.g. `Connection`, `X-Cache`, `X-Forwarded-Proto`, `X-Edge-*`, `X-Amz-Cf-*`) are hidden from functions and can't be added; read-only headers can't be added, changed or deleted. `Host` is now editable in origin-request.
* **cff:** CloudFront Functions get the same header validation as Lambda@Edge (`FunctionValidationError`)
* **edge:** generated responses are limited to 40 KB (headers + body) on viewer events and 1 MB on origin events; replaced request bodies to 40 KB / 1 MB (text) or 53.2 KB / 1.33 MB (base64)
* **cff:** the 10 KB function size limit is a build error under `--strict`
* **pipeline:** combining CloudFront Functions and Lambda@Edge on viewer events is flagged (`InvalidFunctionAssociation` 502 under `--strict`, a warning otherwise)


### Bug Fixes

* **edge:** the Lambda@Edge timeout is 30 seconds for all events (was 5 s for viewer events)
* **edge:** a viewer-request body over 40 KB is truncated (`inputTruncated: true`) instead of failing with 502
* **pipeline:** a URI rewrite no longer changes the origin a request is routed to
* **pipeline:** viewer-response functions no longer run when the origin returns 400 or higher
* **edge:** Lambda@Edge viewer-response functions can no longer change the status code
* **tutorial:** the CFF header-injector exercise used `X-Edge-Powered-By`, which AWS disallows; it now uses `X-Powered-By`


### Behavior changes

* **Timing only warns, in every mode.** `--strict` no longer fails a request when a Lambda@Edge function exceeds its 30 s limit, because local hardware isn't AWS hardware. Only runaway code is stopped with a 503: a handler still running after 60 s, or a CloudFront Function after 1 s (previously 50 ms). A runaway CloudFront Function now returns 503 in default mode too, instead of being skipped.
* **Routing:** requests that relied on a function rewriting the URI to reach a different origin now stay on the origin matched by the original URI, as in CloudFront.

## [2.1.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v2.0.3...v2.1.0) (2026-09-30)


### Features

* **cli:** `--cors` adds `Access-Control-Allow-Origin: *` and answers CORS preflight requests (previously a no-op)
* **cli:** `--single` serves `index.html` (status 200) when the origin returns 404 or 403, for local and S3 origins (previously a no-op)
* **cli:** `-u/--no-compression`, `--no-etag` and `-L/--no-request-logging` now take effect (previously no-ops); `-L` disables per-request access logs
* **origin:** local origins send `ETag` alongside `Last-Modified`, like S3


### Bug Fixes

* **edge:** strict-mode Lambda@Edge timeouts return 503 `LambdaLimitExceeded` instead of silently continuing to the origin
* **edge:** without `--strict`, a handler that never settles fails with 503 at twice its timeout instead of hanging the request
* **edge:** hook exceptions and rejections return 503 `LambdaExecutionError` / `FunctionExecutionError`; strict forbidden-header mutations return 502 `LambdaValidationError`
* **cff:** CloudFront Functions run with a 50ms VM timeout, so an infinite loop no longer freezes the process (including at startup)
* **edge:** a request body replaced on a returned new request object is forwarded, and `encoding: 'text'` bodies are no longer base64-decoded
* **edge:** internal fields (`id`, `type`, `uri`, `totalDurationMs`) no longer leak as response headers, and `bodyEncoding: 'base64'` generated responses are decoded
* **cli:** `--version`, the startup banner and the WebUI report the real package version (previously 1.10.x)


### Security

* **webui:** the WebUI listens on `127.0.0.1` only and rejects requests with a foreign `Host` or `Origin` (blocks cross-site requests and DNS rebinding). It is no longer reachable from other machines.
* **webui:** "open in editor" only opens loaded hook and config files, and no longer runs through a shell
* **webui:** static assets can no longer be read from outside the UI directory using `..` paths


### Maintenance

* CI typechecks the project, including tests, on every pull request; `prepublishOnly` runs the typecheck before building
* Tests no longer depend on local machine state (a busy port 9999, or a built UI)

## [2.0.3](https://github.com/felipecarrillo100/cloudfrontize/compare/v2.0.2...v2.0.3) (2026-05-06)


### Bug Fixes

* **doc:** Install also ui-src dependencies ([70115b7](https://github.com/felipecarrillo100/cloudfrontize/commit/70115b714dba5763be9618c79defc73a24e2392d))

## [2.0.2](https://github.com/felipecarrillo100/cloudfrontize/compare/v2.0.1...v2.0.2) (2026-05-06)


### Bug Fixes

* **doc:** Fixed documentation ([d698bc7](https://github.com/felipecarrillo100/cloudfrontize/commit/d698bc7253ae49d500efcc561a52a86392c648e6))

## [2.0.1](https://github.com/felipecarrillo100/cloudfrontize/compare/v2.0.0...v2.0.1) (2026-05-06)


### Bug Fixes

* **LocalProvider:** Local provider is now working properly when handling paths /folder/ ([e18fc7c](https://github.com/felipecarrillo100/cloudfrontize/commit/e18fc7c82ef095f9bde4698a06cd19504b1e3c5b))
* **LocalProvider:** Properly implements S3Provider.ts ([18f9266](https://github.com/felipecarrillo100/cloudfrontize/commit/18f92665bbb5d55dc430f36ab59c4b7fdda46525))
* **LocalProvider:** Properly implements S3Provider.ts ([3b0d151](https://github.com/felipecarrillo100/cloudfrontize/commit/3b0d1510875db17e3aa571df06cb2fbe4415408e))
* **LocalProvider:** Properly implements S3Provider.ts ([4eb5fd9](https://github.com/felipecarrillo100/cloudfrontize/commit/4eb5fd928700a2df5416d1ef7dcdb1995987b72c))
* **updated:** Deleting headers from L@E and CFF was broken in the pipeline. ([5a928af](https://github.com/felipecarrillo100/cloudfrontize/commit/5a928af28375e23397ef877e3d7ea65e86da9bb9))
* **updated:** Deleting headers from L@E and CFF was broken in the pipeline. ([f240796](https://github.com/felipecarrillo100/cloudfrontize/commit/f240796d6cc27e76a72bbe8759fa9b2153763063))

## [2.0.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.10.2...v2.0.0) (2026-05-06)


### ⚠ BREAKING CHANGES

* migrate to TypeScript and modular architecture (v2.0.0)

### Features

* migrate to TypeScript and modular architecture (v2.0.0) ([923e007](https://github.com/felipecarrillo100/cloudfrontize/commit/923e00738bc062ae2eb48c2df602ff85e3d01f4b))


### Bug Fixes

* **LocalProvider:** Local provider is now working properly when handling paths /folder/ ([e18fc7c](https://github.com/felipecarrillo100/cloudfrontize/commit/e18fc7c82ef095f9bde4698a06cd19504b1e3c5b))
* **LocalProvider:** Properly implements S3Provider.ts ([18f9266](https://github.com/felipecarrillo100/cloudfrontize/commit/18f92665bbb5d55dc430f36ab59c4b7fdda46525))
* **LocalProvider:** Properly implements S3Provider.ts ([3b0d151](https://github.com/felipecarrillo100/cloudfrontize/commit/3b0d1510875db17e3aa571df06cb2fbe4415408e))
* **LocalProvider:** Properly implements S3Provider.ts ([4eb5fd9](https://github.com/felipecarrillo100/cloudfrontize/commit/4eb5fd928700a2df5416d1ef7dcdb1995987b72c))
* **updated:** Deleting headers from L@E and CFF was broken in the pipeline. ([5a928af](https://github.com/felipecarrillo100/cloudfrontize/commit/5a928af28375e23397ef877e3d7ea65e86da9bb9))
* **updated:** Deleting headers from L@E and CFF was broken in the pipeline. ([f240796](https://github.com/felipecarrillo100/cloudfrontize/commit/f240796d6cc27e76a72bbe8759fa9b2153763063))

## [1.10.2](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.10.1...v1.10.2) (2026-03-25)


### Bug Fixes

* strict module isolation and parallel test suite stability ([6641497](https://github.com/felipecarrillo100/cloudfrontize/commit/66414977f572dd2a22a8327873de92246ebece85))

## [1.10.1](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.10.0...v1.10.1) (2026-03-21)


### Bug Fixes

* **docs:** align README with v1.10.0 ([b979a2a](https://github.com/felipecarrillo100/cloudfrontize/commit/b979a2abf91ada0abddeadba591d6d2de3f0ef4b))

## [1.10.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.9.0...v1.10.0) (2026-03-21)


### Features

* atomic hot-reload and debounce logic ([b545493](https://github.com/felipecarrillo100/cloudfrontize/commit/b545493153204c62ae08a2f50f81615f0da67b7e))

## [1.9.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.8.1...v1.9.0) (2026-03-21)


### Features

* achieve True AWS Fidelity and refined startup UX ([92aac3a](https://github.com/felipecarrillo100/cloudfrontize/commit/92aac3a1ccea6b59c262b4df0b2a7127c04ea7ec))
* add web UI preset management and uniqueness validation ([b1a731f](https://github.com/felipecarrillo100/cloudfrontize/commit/b1a731fad085a6b9ed2f31fa6ac068ac8ac8434e))
* add WebUI for CloudFrontize ([f773f81](https://github.com/felipecarrillo100/cloudfrontize/commit/f773f81e97260cf1728bc7386da9a6789efc74d1))
* **cli:** enhance console logging and UX ([8726fdb](https://github.com/felipecarrillo100/cloudfrontize/commit/8726fdb238eebbea8719951d7c310892cb2a411c))
* fully implemented CFF adding response cookie serialization in simulator ([0df19c9](https://github.com/felipecarrillo100/cloudfrontize/commit/0df19c9cc4146ae4458a556d97e9797bd39ff0f6))
* implement CFF response cookie serialization ([4bc949a](https://github.com/felipecarrillo100/cloudfrontize/commit/4bc949abe68f836f015db2ecf21909c46295ecd0))
* resilient hot-reload with Vite-style WebUI build overlays ([6ba7bd6](https://github.com/felipecarrillo100/cloudfrontize/commit/6ba7bd66e90611fcdb01e57f09ed8e6015ad1c86))


### Bug Fixes

* **cff:** enforce strict execution contract for runtime errors ([e0bdb06](https://github.com/felipecarrillo100/cloudfrontize/commit/e0bdb06dea52d59013427c73647c50763aa7e8cb))
* **cli:** improve CLI reporting and networking control ([c4801f3](https://github.com/felipecarrillo100/cloudfrontize/commit/c4801f38f7d185e5fb760e2db3529cc01816896c))
* **cli:** pass strict flag to EdgeRunner constructor ([22a8a5c](https://github.com/felipecarrillo100/cloudfrontize/commit/22a8a5cf6dd876d889b593c9056d8aa6c398d061))
* enforce CloudFront response contract for 502 errors ([e1b009c](https://github.com/felipecarrillo100/cloudfrontize/commit/e1b009ca121a60c54193a35752af201e0887dee3))
* improve hot-reload error reporting in EdgeRunner and CFFRunner ([d6af72a](https://github.com/felipecarrillo100/cloudfrontize/commit/d6af72ad544f6f1741bbe7e98e2b5e5b66433b1c))
* **networking:** networking improvements ([7a3ebfe](https://github.com/felipecarrillo100/cloudfrontize/commit/7a3ebfe91007e99460a6a988afcaf161559fb4a2))
* pass strict flag to EdgeRunner constructor ([df9fc0d](https://github.com/felipecarrillo100/cloudfrontize/commit/df9fc0d61da30e0dc930f603af9069ae2058f954))
* restore simulator integrity and resolve fidelity regressions ([bde352f](https://github.com/felipecarrillo100/cloudfrontize/commit/bde352f04333c38c698c6f955d32bdcc8a3ad4b4))
* **runner:** resolve EdgeRunner crash and stabilize hot-reload ([889c9ad](https://github.com/felipecarrillo100/cloudfrontize/commit/889c9ad0a349446736fee11f2136be93f36a1294))
* **server:** unify telemetry broadcast via finish event ([2b556ed](https://github.com/felipecarrillo100/cloudfrontize/commit/2b556edb22ac549fd44d98cf0d384684ff423df9))
* **simulator:** enforce CloudFront response contract for 502 errors ([68c43d9](https://github.com/felipecarrillo100/cloudfrontize/commit/68c43d95b56f987c4bc28ce065eedf25dc0e124c))
* standardize hot-reload error reporting ([cc37338](https://github.com/felipecarrillo100/cloudfrontize/commit/cc37338d76f12891bab07d917132d966bd359635))
* update release permissions and implement CFF cookie serialization ([d5b62bf](https://github.com/felipecarrillo100/cloudfrontize/commit/d5b62bffe7e94b6af765d850540c40667d70814f))
* WebUI Logo and About Form ([8a49fef](https://github.com/felipecarrillo100/cloudfrontize/commit/8a49fef1983c23ed30f6a7a2186e9a4c55724239))

## [1.8.1](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.8.0...v1.8.1) (2026-03-21)


### Bug Fixes

* **runner:** resolve EdgeRunner crash and stabilize hot-reload ([889c9ad](https://github.com/felipecarrillo100/cloudfrontize/commit/889c9ad0a349446736fee11f2136be93f36a1294))

## [1.8.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.7.1...v1.8.0) (2026-03-21)


### Features

* achieve True AWS Fidelity and refined startup UX ([92aac3a](https://github.com/felipecarrillo100/cloudfrontize/commit/92aac3a1ccea6b59c262b4df0b2a7127c04ea7ec))
* add web UI preset management and uniqueness validation ([b1a731f](https://github.com/felipecarrillo100/cloudfrontize/commit/b1a731fad085a6b9ed2f31fa6ac068ac8ac8434e))
* add WebUI for CloudFrontize ([f773f81](https://github.com/felipecarrillo100/cloudfrontize/commit/f773f81e97260cf1728bc7386da9a6789efc74d1))
* **cli:** enhance console logging and UX ([8726fdb](https://github.com/felipecarrillo100/cloudfrontize/commit/8726fdb238eebbea8719951d7c310892cb2a411c))
* fully implemented CFF adding response cookie serialization in simulator ([0df19c9](https://github.com/felipecarrillo100/cloudfrontize/commit/0df19c9cc4146ae4458a556d97e9797bd39ff0f6))
* implement CFF response cookie serialization ([4bc949a](https://github.com/felipecarrillo100/cloudfrontize/commit/4bc949abe68f836f015db2ecf21909c46295ecd0))
* resilient hot-reload with Vite-style WebUI build overlays ([6ba7bd6](https://github.com/felipecarrillo100/cloudfrontize/commit/6ba7bd66e90611fcdb01e57f09ed8e6015ad1c86))


### Bug Fixes

* **cff:** enforce strict execution contract for runtime errors ([e0bdb06](https://github.com/felipecarrillo100/cloudfrontize/commit/e0bdb06dea52d59013427c73647c50763aa7e8cb))
* **cli:** improve CLI reporting and networking control ([c4801f3](https://github.com/felipecarrillo100/cloudfrontize/commit/c4801f38f7d185e5fb760e2db3529cc01816896c))
* **cli:** pass strict flag to EdgeRunner constructor ([22a8a5c](https://github.com/felipecarrillo100/cloudfrontize/commit/22a8a5cf6dd876d889b593c9056d8aa6c398d061))
* enforce CloudFront response contract for 502 errors ([e1b009c](https://github.com/felipecarrillo100/cloudfrontize/commit/e1b009ca121a60c54193a35752af201e0887dee3))
* improve hot-reload error reporting in EdgeRunner and CFFRunner ([d6af72a](https://github.com/felipecarrillo100/cloudfrontize/commit/d6af72ad544f6f1741bbe7e98e2b5e5b66433b1c))
* **networking:** networking improvements ([7a3ebfe](https://github.com/felipecarrillo100/cloudfrontize/commit/7a3ebfe91007e99460a6a988afcaf161559fb4a2))
* pass strict flag to EdgeRunner constructor ([df9fc0d](https://github.com/felipecarrillo100/cloudfrontize/commit/df9fc0d61da30e0dc930f603af9069ae2058f954))
* restore simulator integrity and resolve fidelity regressions ([bde352f](https://github.com/felipecarrillo100/cloudfrontize/commit/bde352f04333c38c698c6f955d32bdcc8a3ad4b4))
* **server:** unify telemetry broadcast via finish event ([2b556ed](https://github.com/felipecarrillo100/cloudfrontize/commit/2b556edb22ac549fd44d98cf0d384684ff423df9))
* **simulator:** enforce CloudFront response contract for 502 errors ([68c43d9](https://github.com/felipecarrillo100/cloudfrontize/commit/68c43d95b56f987c4bc28ce065eedf25dc0e124c))
* standardize hot-reload error reporting ([cc37338](https://github.com/felipecarrillo100/cloudfrontize/commit/cc37338d76f12891bab07d917132d966bd359635))
* update release permissions and implement CFF cookie serialization ([d5b62bf](https://github.com/felipecarrillo100/cloudfrontize/commit/d5b62bffe7e94b6af765d850540c40667d70814f))
* WebUI Logo and About Form ([8a49fef](https://github.com/felipecarrillo100/cloudfrontize/commit/8a49fef1983c23ed30f6a7a2186e9a4c55724239))

## [1.7.1](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.7.0...v1.7.1) (2026-03-21)


### Bug Fixes

* restore simulator integrity and resolve fidelity regressions ([bde352f](https://github.com/felipecarrillo100/cloudfrontize/commit/bde352f04333c38c698c6f955d32bdcc8a3ad4b4))

## [1.7.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.6.8...v1.7.0) (2026-03-21)


### Features

* achieve True AWS Fidelity and refined startup UX ([92aac3a](https://github.com/felipecarrillo100/cloudfrontize/commit/92aac3a1ccea6b59c262b4df0b2a7127c04ea7ec))

## [1.6.8](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.6.7...v1.6.8) (2026-03-21)


### Bug Fixes

* **cli:** improve CLI reporting and networking control ([c4801f3](https://github.com/felipecarrillo100/cloudfrontize/commit/c4801f38f7d185e5fb760e2db3529cc01816896c))

## [1.6.7](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.6.6...v1.6.7) (2026-03-21)


### Bug Fixes

* **networking:** networking improvements ([7a3ebfe](https://github.com/felipecarrillo100/cloudfrontize/commit/7a3ebfe91007e99460a6a988afcaf161559fb4a2))

## [1.6.6](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.6.5...v1.6.6) (2026-03-20)


### Bug Fixes

* **cff:** enforce strict execution contract for runtime errors ([e0bdb06](https://github.com/felipecarrillo100/cloudfrontize/commit/e0bdb06dea52d59013427c73647c50763aa7e8cb))

## [1.6.5](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.6.4...v1.6.5) (2026-03-20)


### Bug Fixes

* **server:** unify telemetry broadcast via finish event ([2b556ed](https://github.com/felipecarrillo100/cloudfrontize/commit/2b556edb22ac549fd44d98cf0d384684ff423df9))

## [1.6.4](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.6.3...v1.6.4) (2026-03-20)


### Bug Fixes

* **cli:** pass strict flag to EdgeRunner constructor ([22a8a5c](https://github.com/felipecarrillo100/cloudfrontize/commit/22a8a5cf6dd876d889b593c9056d8aa6c398d061))
* pass strict flag to EdgeRunner constructor ([df9fc0d](https://github.com/felipecarrillo100/cloudfrontize/commit/df9fc0d61da30e0dc930f603af9069ae2058f954))

## [1.6.3](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.6.2...v1.6.3) (2026-03-20)


### Bug Fixes

* enforce CloudFront response contract for 502 errors ([e1b009c](https://github.com/felipecarrillo100/cloudfrontize/commit/e1b009ca121a60c54193a35752af201e0887dee3))
* **simulator:** enforce CloudFront response contract for 502 errors ([68c43d9](https://github.com/felipecarrillo100/cloudfrontize/commit/68c43d95b56f987c4bc28ce065eedf25dc0e124c))

## [1.6.2](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.6.1...v1.6.2) (2026-03-20)


### Bug Fixes

* standardize hot-reload error reporting ([cc37338](https://github.com/felipecarrillo100/cloudfrontize/commit/cc37338d76f12891bab07d917132d966bd359635))

## [1.6.1](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.6.0...v1.6.1) (2026-03-20)


### Bug Fixes

* improve hot-reload error reporting in EdgeRunner and CFFRunner ([d6af72a](https://github.com/felipecarrillo100/cloudfrontize/commit/d6af72ad544f6f1741bbe7e98e2b5e5b66433b1c))

## [1.6.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.5.0...v1.6.0) (2026-03-20)


### Features

* resilient hot-reload with Vite-style WebUI build overlays ([6ba7bd6](https://github.com/felipecarrillo100/cloudfrontize/commit/6ba7bd66e90611fcdb01e57f09ed8e6015ad1c86))

## [1.5.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.4.0...v1.5.0) (2026-03-18)


### Features

* **cli:** enhance console logging and UX ([8726fdb](https://github.com/felipecarrillo100/cloudfrontize/commit/8726fdb238eebbea8719951d7c310892cb2a411c))

## [1.4.0](https://github.com/felipecarrillo100/cloudfrontize/compare/v1.3.1...v1.4.0) (2026-03-18)


### Features

* add web UI preset management and uniqueness validation ([b1a731f](https://github.com/felipecarrillo100/cloudfrontize/commit/b1a731fad085a6b9ed2f31fa6ac068ac8ac8434e))

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
