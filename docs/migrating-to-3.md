# Migrating to CloudFrontize 3

CloudFrontize 3 works with **projects**: a folder with a `cloudfrontize.json` that describes the distribution (origins, cache behaviors, which function runs on which event), opened in the browser workbench or run from the command line. 2.x command lines keep working, so you can move when it suits you.

> Staying on 2.x for now? `npm install -g cloudfrontize@2` installs the latest 2.x release.

## At a glance

| | 2.x | 3.0 |
|---|---|---|
| Setup | Command-line flags (`--edge`, `--cff`, `--origins`, `--headers`…) | A project folder with `cloudfrontize.json` (2.x flags still work) |
| Where functions run | Every path; the event from `exports.hookType` or the file name | Per cache behavior and event, as in CloudFront |
| AWS rules | Checked per request (`--strict`) | Checked when the project loads (`cloudfrontize validate`), and per request |
| CloudFront Functions | Runtime 1.0 (ES 5.1) | Runtime 1.0 and 2.0, with KeyValueStore |
| WebUI | Traffic inspector with header overrides | The workbench: start screen, schematic, editor, traffic journeys |
| Production files | `--output` | `cloudfrontize build` |
| Starting a new setup | By hand | `cloudfrontize init --template …` |
| Testing a setup | By hand | `cloudfrontize check` (`checks.json`) |
| Node.js | 20+ | **22+** |

## Do I have to migrate?

No. `cloudfrontize ./www --edge ./hooks` still works and shows the equivalent `import` command when it starts. Migrate to get cache behaviors, the workbench editor, the AWS rule checks and `cloudfrontize check`. Some behaviors changed in both modes, to match AWS: read the [breaking changes](#breaking-changes) either way.

## Migrate in five minutes

1. **Import.** Take your 2.x command and replace `cloudfrontize` with `cloudfrontize import`, adding `--out`:

   ```bash
   # 2.x
   cloudfrontize ./www --edge ./hooks --cff ./cff --headers ./headers.json --bake ./prod.variables
   # 3.0
   cloudfrontize import ./www --edge ./hooks --cff ./cff --headers ./headers.json --bake ./prod.variables --out ./my-site
   ```

   It creates `./my-site` with:
   - `origins/`: copies of your local folders. S3 origins keep their settings, never their access keys (they become `"credentials": { "fromEnv": true }`; use a profile or environment variables);
   - `functions/cloudfront/` and `functions/lambda-edge/`: your function files, named `<event>.<id>.js`, plus their helper subfolders (`lib/`, `node_modules/`);
   - `config/`: the headers, env and bake files;
   - `cloudfrontize.json`, attaching every function where 2.x ran it.

2. **Read the notes.** `import` lists everything it decided. 2.x was more permissive than AWS, so a few functions may be left unattached:
   - **One function per event.** 2.x chained several CloudFront Functions on the same event, and used only the first Lambda@Edge file per event; AWS allows one function per event per behavior. The first is attached.
   - **No mixing on viewer events.** A behavior can't run CloudFront Functions and Lambda@Edge on its viewer events. The CloudFront Functions (which 2.x ran first) are kept.
   - **CloudFront Functions on origin events** don't run in AWS; they're kept in the project, unattached.
   - **Every behavior runs every function**, because 2.x ran them on every path. Remove the ones a behavior doesn't need.

   Unattached functions stay in the project: attach them where AWS allows, from the workbench's schematic or in `cloudfrontize.json`.

3. **Validate, then run:**

   ```bash
   cd my-site
   cloudfrontize validate
   cloudfrontize --webui
   ```

4. **Add checks** (optional, recommended): a `checks.json` with requests and the responses they must get, then `cloudfrontize check` (also in CI). The [templates](../templates/) and [tutorials](../tutorial/v3/README.md) all have one to copy from.

5. **Build for deployment:** `cloudfrontize build` replaces `--output`. It writes `dist/cloudfront/<id>.js`, `dist/lambda-edge/<id>/index.js` and `dist/build.json` (where each function is attached), with your bake file's values. Use `--bake config/production.env` for another environment, and `--level minified` to minify.

## Breaking changes

These apply in projects **and** with 2.x command lines.

### Lambda@Edge runs like Lambda

- **No host environment variables.** Functions see only AWS's reserved variables and your env file (`--env` / `"environment"`), never your machine's environment, as in AWS. `AWS_EXECUTION_ENV` is `AWS_Lambda_nodejs22.x` by default (it follows the function's runtime). If a function read a variable from your shell, put it in the env file (reserved names only) or bake it (`__VAR__`).
- **Modules in every event.** The 2.x per-event module lists are gone: as in AWS, any module loads in any event. `--allow-networking` has no effect (network access is always on); connecting to localhost or a private address prints a warning, because AWS can't reach your machine.
- **A read-only file system, except `/tmp`.** Writes elsewhere fail with `EROFS`, as in Lambda. `/tmp` is a per-project folder in your system's temp directory, so functions can't touch your real `/tmp`. Reading files outside the project warns: they wouldn't be in the deployment package.

### Headers CloudFront adds

Simulated headers that **CloudFront adds** (`CloudFront-Viewer-Country`, `CloudFront-Is-Mobile-Viewer` and the rest of the [documented list](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html)) now reach functions only where AWS exposes them: CloudFront Functions, and Lambda@Edge **origin-request** and **origin-response**. *"CloudFront adds the headers after the viewer request event"*, so a Lambda@Edge **viewer** function never sees CloudFront's value.

If a Lambda@Edge viewer-request function reads one of them from `--headers` or the WebUI presets, it now sees nothing. Move the logic to an origin-request function (geo routing), or to a CloudFront Function (device redirects). [Tutorial 1.3](../tutorial/v3/01-foundations/1.3-concierge/README.md) shows the change. A header the *client* sends (`curl -H "CloudFront-Viewer-Country: FR"`) still reaches viewer functions, as in AWS.

### Query strings in response events

*"A function can read a query string, but cannot create or update one, for origin response and viewer response events."* Changing `request.querystring` there is now ignored, with a warning (a 502 under `--strict`).

### CloudFront Functions

- `Date` doesn't advance during a run: it stays at the function's start time, as AWS documents.
- Cookies are in `request.cookies`, not in `request.headers.cookie`, as in the CloudFront Functions event structure.
- A run's logs are truncated at 10 KB (*"Function logs in CloudFront Functions are truncated at 10 KB"*), with a last line saying so.
- 2.x files run as **runtime 1.0** (ES 5.1). In a project, choose `"runtime": "cloudfront-js-2.0"` for modern JavaScript and KeyValueStore.

### The WebUI

The WebUI is the new workbench, and its API is `/api/v2` only: the 2.x endpoints (`/events`, `/api/distribution`, `/api/sticky`, `/api/hooks/control`, `/api/detail`, `/api/open-editor`, `/api/production-code`) are gone. If you scripted against them, see the API v2 section of [ARCHITECTURE.md](../ARCHITECTURE.md) (types in [`src/api/contract.ts`](../src/api/contract.ts)). With a 2.x command line, the workbench shows what runs, read-only; the header simulation applies for the session, like `--headers`.

### Node.js 22

CloudFrontize 3 requires Node.js 22 or later (Node 20 reached end of life in April 2026).

## The library API

`startServer(options)` (2.x) still works. For projects, use `createServer({ project, port, webui })`, which resolves once the server listens, with `openProject()`, `reload()`, `saveManifest()` and `closeGracefully()`; plus `loadProject()` and `checkManifest()` to read and validate projects, and `createProject()`, `listTemplates()`, `buildProject()`, `importLegacySetup()` and `runChecks()`, which the `init`, `templates`, `build`, `import` and `check` commands use. Types ship with the package.

Import it from the package name: `require('cloudfrontize')` or `import { createServer } from 'cloudfrontize'`. In 2.x the package's entry point was the command line, so library code had to reach into `cloudfrontize/dist/src/index.js`; in 3.0 that path isn't exported any more (only the package and `cloudfrontize/schema/*` are).
