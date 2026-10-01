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
- Staging a `.ts` file with an eslint error and committing: the hook runs
  `eslint --fix`, reports `Parsing error: Expression expected`, reverts to the
  original state and refuses the commit. HEAD is unchanged. The gate has teeth.
- Staging a clean `.ts` file and committing: `eslint --fix` completes and the
  commit lands.
- A conflicted merge, resolved and committed without `--no-verify`: lint-staged
  runs through it and the merge commit lands. lint-staged handles this case
  itself, backing up and restoring `MERGE_HEAD`, `MERGE_MODE` and `MERGE_MSG`.

An earlier revision of this note claimed only that "lint-staged runs and the git
hint is gone". That was true and it proved very little, because the commit it
was based on staged no `.ts` files, so lint-staged exited before reaching the
stash path where the real work happens.

## A stale lock made this look broken

Worth recording, because the symptom is opaque and the cause is not in this
diff. On the machine where the hook was first enabled, every commit staging a
`.ts` file failed with:

```
✖ lint-staged failed due to a git error.
```

lint-staged isolates staged content by stashing the working tree, via
`git stash create` then `git stash store`. The store failed:

```
error: update_ref failed for ref 'refs/stash': cannot lock ref 'refs/stash':
Unable to create '.git/refs/stash.lock': File exists.
```

`.git/refs/stash.lock` was over a month old, left behind by a git process that
crashed mid-stash, along with two `.git/index.stash.<pid>.lock` files from dead
PIDs. Git's own advice is to delete such a file, and removing all three restored
`git stash store`. The nine existing stashes were unaffected, verified by
comparing `git stash list` before and after.

This is local repository state, so it travels with nobody. It is recorded here
because a newly-enabled pre-commit hook is exactly when a long-dormant stale
lock surfaces, and "failed due to a git error" gives no clue on its own. Run
`git stash create && git stash store -m probe <sha>` to see the real message.
