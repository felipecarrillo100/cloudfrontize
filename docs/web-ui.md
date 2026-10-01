# The CloudFrontize workbench (WebUI)

The workbench is CloudFrontize in your browser: open or create projects, build the distribution on a schematic, write functions in a built-in editor, and watch every request travel through CloudFront's events. Everything you change is saved in the project folder, so it can go into git and run the same way from the command line.

## Start it

```bash
cloudfrontize ./my-project --webui        # the WebUI on the main port + 1 (3001)
cloudfrontize ./my-project --webui 4000   # or on a port of your choice
```

Then open `http://localhost:3001/`.

> 🔒 The WebUI shows your function code and can change your project, so it only listens on this machine (`127.0.0.1` and `::1`) and refuses requests from other sites. Open it from the same machine, with `localhost` or `127.0.0.1`.

Without a project argument, run it from a project folder, or start it on any project and open another from the start screen.

## The start screen

Shown when no project is open, or from the logo at the top left:

- **New project**: a name, a location (pick a folder), and the origin: a local folder (`origins/www`, with a starter page) or an S3 bucket (bucket, region, an endpoint for MinIO or LocalStack, REST or website behavior, an AWS profile). AWS keys are never stored in the project.
- **Open project…**: browse to a folder with a `cloudfrontize.json`. Projects are marked in the list. Browsing is limited to your home folder, the folder CloudFrontize was started in, and the open project's folder.
- **Recent projects**: click to open; projects that were moved or deleted are marked.

## The schematic

The top of the workbench shows the distribution the way CloudFront runs it:

```
Viewer ── viewer-request ──▶ Distribution ── origin-request ──▶ Origin
       ◀── viewer-response ──              ◀── origin-response ──
```

- **Cache behaviors** are the tabs above it, in the order CloudFront matches them (the first matching path pattern wins; the default behavior catches the rest). **Add behavior** creates one.
- Each behavior has the **four event slots**, each with a note on when it runs (viewer events on every request; origin events on cache misses; viewer-response not when the origin returns 400 or more).
- **Add function** on an empty slot offers only what AWS allows there, and says why the rest isn't allowed:
  - CloudFront Functions run only on viewer events.
  - A behavior can't mix CloudFront Functions and Lambda@Edge on its two viewer events.
  - Each event runs one function.

  Create a new function (its file goes to `functions/cloudfront/` or `functions/lambda-edge/`, with starter code), or attach one the project already has.
- **A function in a slot**: click to inspect it, double-click to edit its code, right-click (or use its **⋯** button) for its actions: edit code, open in VS Code, view the production build, disable it or isolate it for testing (not saved), rename, remove from the slot, delete.
- **Viewer**, **Distribution** and **Origin** open their inspectors.

## Inspectors

The panel on the right shows whatever is selected.

| Inspector | What you can do |
|---|---|
| **Viewer** | Send a **test request** (method, path, headers, body): the response appears, and its journey opens in Traffic. Edit the **viewer simulation**: headers added to every request (or to every origin response). Location and device presets use the header names CloudFront adds (`CloudFront-Viewer-Country`, `CloudFront-Is-Mobile-Viewer`…), with a matching User-Agent for devices. |
| **Distribution** | Settings: strict mode, compression, ETag, single-page app, CORS, request logging. The behaviors in match order: add, edit, reorder, delete. Edit `cloudfrontize.json` directly. |
| **Origin** | Which origin the selected behavior uses; the origin's settings (a local folder, or an S3 bucket with region, endpoint, path-style URLs, REST or website behavior, credentials from the default chain, a profile or the environment); **Test connection**; add or delete origins. |
| **Function** | Build state (with the line of a build error), runtime, the key value store a CloudFront Function reads, its size against the 10 KB CloudFront Functions limit, and the behaviors and events it runs on. |

> **Headers CloudFront adds follow AWS.** In the viewer simulation they're marked *CloudFront adds this*: Lambda@Edge sees them only in origin request and origin response; CloudFront Functions see them on viewer events too. A value CloudFront adds overrides one the client sends.

## The editor

Function code, key value stores and `cloudfrontize.json` open as tabs next to the schematic.

- **Ctrl+S / ⌘S** saves. The emulator rebuilds the function at once, and problems appear next to the code (red: errors, yellow: warnings) and in the list below it; click one to go to its line. Changes to `cloudfrontize.json` are checked against every AWS rule CloudFrontize knows, and each problem is placed on the field it concerns. A key value store AWS wouldn't import isn't saved.
- **Completions** for CloudFront's event structures: in Lambda@Edge functions through `exports.handler`, in CloudFront Functions through the `@param {CloudFrontFunctionEvent} event` comment of the starter code. `import cf from 'cloudfront'` completes the key value store helpers.
- **Edited elsewhere?** If the file changed on disk (another editor, git) since you opened it, saving shows both versions side by side: keep yours or take the one on disk. While you have no unsaved changes, the editor simply follows the file.
- CloudFront Functions show a live size meter (10 KB, not adjustable). The editor works offline: it's bundled with CloudFrontize.

Editing files in VS Code or any other editor works too: CloudFrontize reloads the project when `cloudfrontize.json` changes, rebuilds functions when their files change, and applies the viewer headers file when it's saved.

## Traffic

The bottom of the workbench lists every request through the distribution as it happens, newest first.

- **Filter** errors, redirects or responses generated by a function, or **search** by path, status or method. Up and down arrows move through the list.
- **Select a request** to see its journey step by step: the viewer's request, each function that ran, the request to the origin, the origin's response, and what the viewer got.
- **Each step** shows its headers and what changed since the previous step on the same side (added, changed, removed), so you see exactly what each function did; and its body, decoded when it's text.
- **cURL** copies the request as a command; **Resend** sends it again. **Clear** empties the history.

## 2.x command-line setups

Started the 2.x way (`cloudfrontize ./www -e ./hooks --webui`), the workbench shows what runs, read-only: functions run on every path, and there are no files to edit. Test requests work, and the viewer simulation applies for the session (like `--headers`). Create a project to get cache behaviors, the editor and the AWS rule checks.
