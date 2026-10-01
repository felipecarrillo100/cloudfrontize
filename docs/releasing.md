# Releasing CloudFrontize

Stable releases come from `main` through release-please (`.github/workflows/release.yml`): merging its release PR updates `package.json` and `CHANGELOG.md`, tags `vX.Y.Z` and creates the GitHub release. Publishing to npm is manual.

Prereleases (`X.Y.Z-beta.N`) are cut by hand from their development branch (for 3.0: `v3`), because release-please runs only on `main`.

## Verify (every release)

```bash
npm ci && npm --prefix ui-src ci
npm run typecheck
npm test                                  # backend
npm run tutorials                         # every tutorial and template, end to end
(cd ui-src && npx vitest run && npm run lint)
npm run build
npm run docs                              # regenerates docs/html; commit it if it changed
```

Then check the package as users get it:

```bash
npm pack --dry-run                        # dist/, schema/, templates/, README, LICENSE; no tests or .tmp
npm pack && mkdir /tmp/cfz && cd /tmp/cfz && npm init -y && npm i <path>/cloudfrontize-<version>.tgz
npx cloudfrontize --version
npx cloudfrontize init smoke --template spa && cd smoke && npx cloudfrontize check
node -e "console.log(Object.keys(require('cloudfrontize')))"
```

And a manual pass through the workbench (`cloudfrontize --webui` in a project): create a project, add a behavior and a function, edit and save it, send a test request and read its journey.

## A prerelease (beta)

1. On the development branch: `npm version 3.0.0-beta.N --no-git-tag-version` (updates `package.json` and `package-lock.json`).
2. Run **Verify**.
3. Commit (`chore: 3.0.0-beta.N`), tag and push:
   ```bash
   git tag v3.0.0-beta.N && git push origin v3 v3.0.0-beta.N
   ```
4. Publish under the `next` tag, so `npm install cloudfrontize` keeps installing the stable release:
   ```bash
   npm publish --tag next
   npm dist-tag ls cloudfrontize            # latest: 2.x, next: 3.0.0-beta.N
   ```
5. Create a GitHub release from the tag, marked **pre-release**, with the release notes.

Never `npm publish` a prerelease without `--tag next`: it would become `latest`.

## The 3.0.0 release

1. **Keep 2.x maintainable:** before merging, branch it off `main`: `git branch 2.x main && git push origin 2.x`. 2.x fixes go there from then on (publish them with `npm publish --tag v2-latest`, so they don't take `latest` from 3.x).
2. **Prepare `v3`:** remove the beta notes (README *Getting started*, top of `docs/migrating-to-3.md`), and update the screenshots in `assets/` (`cloudfrontize-pro-ui.png`) and in `docs/web-ui.md` if they still show the 2.x UI.
3. **Merge `v3` into `main`** with a merge commit (keeps the milestone history, which release-please turns into the changelog). The PR description lists the breaking changes.
4. **Pin the version.** Release-please computes versions from the commits since the last release; a commit with a `Release-As` footer overrides that:
   ```bash
   git checkout main && git pull
   git commit --allow-empty -m "feat!: CloudFrontize 3.0" -m "BREAKING CHANGE: see docs/migrating-to-3.md" -m "Release-As: 3.0.0"
   git push
   ```
5. **Release PR:** release-please opens `chore(main): release 3.0.0`. Edit its `CHANGELOG.md` entry if needed (a short summary at the top, the link to the migration guide), then merge it. It tags `v3.0.0` and creates the GitHub release.
6. **Publish:**
   ```bash
   git pull && npm ci && npm --prefix ui-src ci && npm publish     # prepublishOnly typechecks and builds
   npm dist-tag add cloudfrontize@3.0.0 next                       # `next` shouldn't stay on a beta
   npm dist-tag ls cloudfrontize
   ```
7. Check the npm page (README, version and Node badges) and `npx --yes cloudfrontize@latest --version`.
