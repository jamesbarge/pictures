# Post-deploy verification never ran, and would have passed against a login page

**PR**: (pending)
**Date**: 2026-09-08

## Two defects, both silent

### 1. The environment name never matched

`.github/workflows/post-deploy-verify.yml` gated on
`github.event.deployment_status.environment == 'Production'`. Vercel names each
environment `<Target> – <project>`, with an EN DASH (U+2013, bytes `e2 80 93`).

Every environment this repo has ever deployed, counted across all 2,747
deployments in the GitHub API:

| Environment | Deployments | Last seen |
|---|---|---|
| `Preview` | 646 | legacy |
| `Production` | 595 | 2026-04-06, final status **failure** |
| `Preview – frontend` | 583 | current |
| `Preview – filmcal2` | 583 | current |
| `Production – frontend` | 266 | 2026-09-08 (the PR #748 deploy) |
| `Production – filmcal2` | 74 | 2026-06-12 |

So the condition matched only the unsuffixed legacy environment, dormant since
April. The job had not run on a real production deploy for months.

### 2. `target_url` is not the application URL

The workflow smoke-tested `deployment_status.target_url`, falling back to
`https://pictures.london`. The fallback never applied, because `target_url` is
always populated. It holds the immutable per-deployment Vercel alias:

```
deployment 6329595503  Production – frontend  success
target_url = https://frontend-ocq1zresk-jamesbarges-projects.vercel.app
```

Vercel Deployment Protection redirects that host to `https://vercel.com/login`,
which answers **HTTP 200**. Measured:

```
https://frontend-ocq1zresk-jamesbarges-projects.vercel.app
  -> HTTP 200  final=https://vercel.com/login?next=%2Fsso-api%3Furl%3D...
```

Had defect 1 been fixed alone, the job would have curled the Vercel sign-in page
and reported a green production verification. The two defects were hiding a
check that could not have worked.

## Changes

`.github/workflows/post-deploy-verify.yml` only:

- The gate is an explicit allowlist of `Production – frontend` and
  `Production – filmcal2`, rather than a `contains`/`startsWith` match on
  "Production". A substring match would enrol any future production-ish
  environment before anyone had decided what URL it should be tested against.
- `target_url` is no longer used. A resolve step maps the environment to its
  public endpoint: frontend to `https://pictures.london`, filmcal2 to
  `https://api.pictures.london/api/cinemas`. Both measured at HTTP 200.
- Unsupported environments are skipped by the job-level allowlist. An
  allowlisted environment without a URL mapping fails with an actionable
  `::error::` rather than testing something arbitrary.

`/api/cinemas` is the backend target because the only `/health` routes on that
app live under `/api/admin` and are Clerk-gated, so none can serve as an
anonymous smoke test.

## Verification

The shipped resolve step was extracted from the YAML and executed directly:
`Production – frontend` to `https://pictures.london`, `Production – filmcal2`
to `https://api.pictures.london/api/cinemas`, and `Preview – frontend`,
`Production` and an invented `Production – newthing` each exit 1.

The `if:` gate was evaluated **manually** against real recorded payloads.
GitHub's expression evaluator was not run, and no GitHub event fired.

## Limitations

- No committed regression test. The repo has no workflow-linting tooling
  (`actionlint` is absent, and adding it is a new dependency), and `if:` is
  evaluated by GitHub. The gate is held by review.
- The fix is unproven end to end until the next production deploy emits a real
  `deployment_status` event.
- `Production – filmcal2` has not deployed since 2026-06-12, so its branch of
  the mapping will stay unexercised in production for as long as that holds.
- The legacy unsuffixed `Production` environment is deliberately excluded. It is
  dormant, and its historical `target_url` values were `filmcal2-*`, implying it
  was the backend before the rename. If it ever deploys again the job will not
  run, by design.
- The smoke test is a single unauthenticated GET returning 2xx. It does not
  assert page content, and `https://pictures.london` follows a redirect to
  `https://www.pictures.london/`.
- Public endpoint availability does not attest that the endpoint is serving
  the exact commit associated with the triggering deployment.

## Independent review

Independent review found no introduced runtime/security blockers. Its P3
documentation finding (unknown environments skip the job rather than fail its
resolver) is corrected above. YAML parsing, both shell blocks' syntax, and
diff whitespace checks passed. The primary reviewer also independently ran
the five-case resolver check successfully; no live deployment event was fired.
