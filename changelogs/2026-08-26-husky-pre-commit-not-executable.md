# Restore the pre-commit eslint hook

**PR**: #747
**Date**: 2026-08-26

## Changes
- Set `.husky/pre-commit` to mode `100755` in the index via
  `git update-index --chmod=+x`, alongside a local `chmod +x`.

## Why

Git refuses to run a hook that is not executable, and says so:

```
hint: The '.husky/pre-commit' hook was ignored because it's not set as executable.
```

The hint appeared on every commit in this repo. Everything else the gate needs
was already in place:

- `package.json` declares `lint-staged` as `{"*.{ts,tsx}": ["eslint --fix"]}`
- `husky@^9.1.7` and `lint-staged@^16.2.7` are both devDependencies
- the `prepare` script runs `husky`
- `core.hooksPath` resolves to `.husky`

So the hook was configured, installed, and pointed at, while the missing
execute bit stopped it running. `git ls-files -s .husky/pre-commit` reported
`100644`, meaning every clone of the repo inherited the same dead hook.

The index mode is the part that matters. A plain `chmod +x` fixes one working
copy; `git update-index --chmod=+x` records `100755` so other clones get it too.

## Impact
- Every developer on the repo. Staged `.ts` and `.tsx` files now get
  `eslint --fix` before the commit lands, which is what the existing
  `lint-staged` config always intended.
- No behaviour change to application code, CI, or the build. One file mode.

## Verification
- `git ls-files -s .husky/pre-commit` reports `100755`.
- Committing on this branch runs lint-staged, and git commits cleanly with the
  "hook was ignored" hint gone.
