# Publishing to npm

This guide covers publishing `@sontx/simplink-core`, `@sontx/simplink-node`, and `@sontx/simplink-mcp` to npm. `@sontx/simplink-ui` is a static SPA and is **not** published.

> **Always publish with `pnpm publish`, never `npm publish`.** `mcp`, `node`, and `ui` depend on each other through `workspace:^`. pnpm replaces that with the real version range (for example `^0.2.0`); npm would publish the literal `workspace:^` and the installs would break.

## 1. Keep `ui` out of the publish

Mark the UI package private so pnpm, npm, and changesets all skip it:

```jsonc
// packages/ui/package.json
{
  "name": "@sontx/simplink-ui",
  "private": true,
  // ...
}
```

Its `files`, `publishConfig`, and `prepack` fields then do nothing and can be removed.

If you'd rather leave `ui` unchanged, use a filter on every publish instead:

```bash
pnpm -r --filter '!@sontx/simplink-ui' publish
```

## 2. One-time setup

```bash
npm login            # or: npm adduser
npm whoami           # should print sontx
```

- You need to own the `@sontx` scope, meaning your npm username is `sontx` or you belong to an npm org named `sontx`.
- Each package sets `publishConfig.access: "public"`, so the scoped packages publish as public.
- If your account uses 2FA for writes, pnpm asks for a one-time code; you can also pass `--otp=123456`.

## 3. Check before publishing

```bash
pnpm install
pnpm lint
pnpm test            # builds all packages, then runs the suites
pnpm lint:kb
```

Check what would go into each tarball:

```bash
for p in core node mcp; do (cd packages/$p && pnpm pack --dry-run); done
```

Each tarball should contain only `dist/`, `LICENSE`, `README.md`, and `package.json` (plus `schemas/` for core). Check that the `bin` targets such as `dist/cli.js` and `dist/bin.js` are included.

## 4. Publish

From the repository root, on a clean `main`:

```bash
pnpm -r publish --access public --dry-run   # rehearsal
pnpm -r publish --access public
```

- pnpm publishes in dependency order (core → node → mcp), so the dependencies already exist when `mcp` publishes.
- It skips any package whose version is already on the registry, so re-running after a partial failure is safe.
- Each package's `prepack` script rebuilds it first.
- By default pnpm refuses to publish if you're not on `main` or have uncommitted changes. That's intentional; `--no-git-checks` overrides it.

Then confirm:

```bash
npm view @sontx/simplink-core
npm view @sontx/simplink-mcp dependencies   # should show ^0.2.0, not workspace:^
npx -y @sontx/simplink-mcp --help            # quick smoke test of the bin
```

## 5. Later releases

The packages are versioned together. Bump the versions, then commit, tag, and publish:

```bash
pnpm -r --filter '!@sontx/simplink-ui' exec npm version 0.3.0 --no-git-tag-version
git commit -am "Release 0.3.0" && git tag v0.3.0
pnpm -r publish --access public
git push --follow-tags
```

If you release often, `@changesets/cli` can handle version bumps and changelogs. It also skips private packages, so `ui` stays out automatically.

## Optional: publish from GitHub Actions

Add an npm "Automation" token as the `NPM_TOKEN` repository secret, and run on tag push:

```yaml
# .github/workflows/release.yml
on: { push: { tags: ["v*"] } }
permissions: { contents: read, id-token: write }
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          {
            node-version: 22,
            registry-url: https://registry.npmjs.org,
            cache: pnpm,
          }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm -r publish --access public --no-git-checks --provenance
        env: { NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}" }
```

`--provenance` adds a verified "built on GitHub Actions" badge on npmjs.com.
