# Releasing CloudFrontize

Releases come from `main`, and two workflows do the work:

- **Release Please** (`.github/workflows/release.yml`) keeps a release PR open with the next version and its changelog, computed from the Conventional Commits since the last release. Merging that PR tags `vX.Y.Z` and creates the GitHub release.
- **Release & Publish** (`.github/workflows/npm-publish.yml`) runs when a GitHub release is published: it builds and publishes to npm. Stable versions become `latest` (and `next`); prereleases (`X.Y.Z-beta.N`) go to `next` only. A version already on npm is skipped.

Nothing is published by hand.

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

Then check the package as users get it, from a clean clone (files missing from git only show up there):

```bash
git clone --branch <branch> <repo> /tmp/cfz-clean && cd /tmp/cfz-clean
npm ci && npm --prefix ui-src ci && npm run build
npm pack --pack-destination /tmp && npm install -g /tmp/cloudfrontize-<version>.tgz
cloudfrontize --version
cloudfrontize init /tmp/cfz-smoke --template spa && cd /tmp/cfz-smoke && cloudfrontize check
```

And a pass through the workbench in a browser (`cloudfrontize --webui` in a project): create a project, add a behavior and a function, edit and save it, send a test request and read its journey. Dialogs and menus should open over the page.

## A stable release

1. Merge the work into `main` with Conventional Commits (`feat:`, `fix:`; `feat!:` or a `BREAKING CHANGE:` footer for a major).
2. Release Please updates its PR (`chore(main): release X.Y.Z`). Edit the PR's `CHANGELOG.md` entry if needed, then merge it.
3. The release is tagged and published to npm automatically. Check:
   ```bash
   npm view cloudfrontize dist-tags        # latest and next: X.Y.Z
   npx --yes cloudfrontize@latest --version
   ```

To force a version (as for 3.0.0), push a commit to `main` whose body has `Release-As: X.Y.Z`:
```bash
git commit --allow-empty -m "chore: release X.Y.Z" -m "Release-As: X.Y.Z"
```

## A prerelease

1. On the branch: `npm version X.Y.Z-beta.N --no-git-tag-version`, run **Verify**, commit and push.
2. Create a GitHub release from a new tag `vX.Y.Z-beta.N` on that commit, marked **pre-release**. The workflow publishes it under `next`; `latest` doesn't change.

## 2.x maintenance

2.x lives on the `2.x` branch (created from `main` before 3.0 was merged). Release Please runs only on `main`, so a 2.x fix is released by hand: bump the version on `2.x`, then publish with a tag that doesn't take `latest` from 3.x:
```bash
npm publish --tag v2-latest
```
Users who stay on 2.x install it with `npm install -g cloudfrontize@2`.

## The 3.0.0 release

1. **GitHub tags for 2.x:** `v2.1.0`, `v2.2.0` and `v2.2.1` were published without tags, so Release Please would compute from v2.0.3. Tag them (`09b149e`, `ce81523`, `bfb2e3f`) and create the `v2.2.1` GitHub release (the publish workflow skips it, it's on npm).
2. **Keep 2.x maintainable:** `git branch 2.x main && git push origin 2.x`.
3. **Merge `v3` into `main`** by PR, with a merge commit (keeps the milestone commits for the changelog).
4. **Pin the version:**
   ```bash
   git checkout main && git pull
   git commit --allow-empty -m "feat!: CloudFrontize 3.0" -m "BREAKING CHANGE: see docs/migrating-to-3.md" -m "Release-As: 3.0.0"
   git push
   ```
5. **Merge the release PR** (`chore(main): release 3.0.0`) after putting a short summary and the migration guide link at the top of its changelog entry. 3.0.0 is then tagged, released and published.
