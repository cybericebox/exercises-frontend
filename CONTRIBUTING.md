# Contributing

`main` holds what is in production, `develop` is the integration branch, `release/X.Y` is a release line of the platform (the same line in every platform repository). Nobody pushes to any of them directly (branch protection applies to admins too): every change is a branch and a pull request. `main` only receives promoted lines, through the pull request that Promote opens.

## The cycle

1. `mise run dev-start <x>`: fetches `develop` and creates `feature/<x>` from it.
2. Work and commit in that branch.
3. `mise run dev-push`: pushes the branch (it refuses on `develop`, `main` and `release/*` and warns about uncommitted changes), opens a PR into `develop` or updates the open one, and turns on auto-merge: the PR merges by itself once every check is green. There is no `minor` label any more: the version comes from the release line (see "Releases").
4. After the merge GitHub deletes the remote branch. `mise run dev-done` switches to `develop`, pulls it and deletes the local branch.

The tasks use `scripts/dev.sh` (the same file in every repository) and need the `gh` CLI, logged in.

### A fix for a release line

A line takes fixes only. Start from the line, not from `develop`:

```bash
mise run dev-start <x> --line 2.20   # fix/2.20/<x> from the fresh release/2.20
# work, commit
mise run dev-push                    # opens the PR into release/2.20; NO auto-merge
```

The PR needs green `Check passed` and `Line gate` (below). **The owner merges it by hand** in GitHub when they are green; `dev-push` never turns on auto-merge for a PR whose base is `release/*`. After the merge `mise run dev-done` deletes the branch. The merge builds the next candidate of this repository and the Backport workflow opens the same change as a PR into `develop` (that one merges by itself like any other).

## Checks

- A PR into `develop` or into a line runs `check.yml`: `test.yml` (the release helpers and `dev.sh` with `mise run test-scripts` and `mise run lint:ci`, lint, typecheck, tests and the other checks of the repository), the container tests and the Docker build, which only reads the registry layer cache `cybericebox/exercises-frontend:buildcache-release` (written by candidate builds) and writes and publishes nothing: a check runs the code of the PR and holds no credential at all (not even a Docker Hub login: public images are pulled anonymously). A new push cancels the previous run; a PR that is moved to another base is checked again (`edited`). The required check is `Check passed`.
- A PR into a line also runs `line-gate.yml`, the required check `Line gate`. A change may enter a line when it touches none of the harness (`.github/**`, `mise.toml`, `mise-tasks/**`, `hack/**`, `scripts/**`, `tools/**`, the linter and test configuration: `.golangci.*`, `eslint.config.*`, `vitest.config.*`, `playwright.config.*`) and is at most 400 changed lines (added plus deleted; lock files such as `package-lock.json` and the generated files are not counted: the explicit lists are in `line_gate.py`, one file for all platform repositories). The label `large-fix`, which the owner sets in GitHub for a justified larger fix, waives the size limit only. There is no title convention. The gate runs from the default branch (`develop`; `pull_request_target` always takes the workflow and the checkout from there, not from the line), reads the changed files through the API and runs nothing of the PR, so a PR cannot edit its own gate or checks. A change to CI goes into `develop` and reaches a line with the next cut; when the CI of a line itself is broken the owner merges the fix with the ruleset bypass.
- A merge into `develop` publishes nothing: no image, no tag. `Build image` (`build.yml`, manual, environment `build`) builds any commit, by default the `develop` head, reading the `buildcache-release` cache, and publishes its `sha-<7>` for an ad-hoc check. When that image exists it is not rebuilt. A `sha-*` image is never promoted.

## Dependency updates

Dependabot opens version updates every Monday morning (Kyiv time), into the default branch (`develop`). Minor and patch updates are grouped: one pull request per ecosystem and kind per week. Major updates come as separate pull requests, so they stay visible. Config: `.github/dependabot.yml`.

- A pull request with only patch updates merges itself into `develop` once the required checks are green (`.github/workflows/dependabot-auto-merge.yml`). That workflow acts only on pull requests whose base is `develop`: a pull request into `release/*` or `main` never gets auto-merge from it.
- Anything with a minor or a major update waits for the owner: review it, fix what breaks, merge it.
- Security fixes come as one grouped pull request per ecosystem (the `*-security` group), not one per package. Critical and high ones are handled the same day. A security pull request with at most minor updates merges itself like a patch one; a major waits for the owner. If production needs the fix, it ships through the release line as a patch (`mise run dev-start <name> --line X.Y`; a lock file does not count towards the 400 lines of the line gate).
- Dependabot runs get no repository secrets and a read-only token. The checks of a pull request use no secret at all, so a Dependabot pull request runs every required job like any other. A step that needs a secret must never be added to the checks.

## Releases

A release is cut from `develop` into a line and travels line, candidates, final release. The commands are in `../../infrastructure` (`mise run release ... --product platform`); the policy is `docs/internal-docs/infrastructure/specs/delivery.md`. All platform repositories share the first two numbers: the first joint line is **2.20** (`release/2.20` in every platform repository, cut together by `release start`); the third number is each repository's own (a fix in one repository gives `v2.20.1` there only). The workflows and scripts are the same as in `laboratory`, without the Helm chart: a platform release is the image `cybericebox/exercises-frontend` and the static site on GitHub Pages.

| Step | Who | Workflow |
|---|---|---|
| 1. Cut `release/X.Y` from `develop` | the operator, `release start --product platform` | none: a new branch is a push, so step 2 starts |
| 2. Candidate `vX.Y.Z-rc.N` on every push to the line | automatic | `candidate.yml` |
| 3. The same change into `develop` | automatic | `backport.yml` |
| 4. Fixes into the line | a PR, merged by the owner by hand | `check.yml`, `line-gate.yml` |
| 5. Promote the candidate that passed staging | the operator, `release promote --product platform` | `promote.yml` |
| 6. Retention | automatic after 5, or by hand | `cleanup.yml` |

- **Candidates.** Every push to `release/X.Y` builds the image `cybericebox/exercises-frontend:vX.Y.Z-rc.N` (linux/amd64, linux/arm64; label `org.opencontainers.image.revision` = the commit), then creates the git tag and the GitHub pre-release. `Z` is 0 while the line has no final release in this repository, otherwise its newest final patch plus 1: the first candidate of a new line is `vX.Y.0-rc.1`, and after `vX.Y.0` is promoted the next merge gives `vX.Y.1-rc.1`. One run per line at a time, so two merges cannot take the same number; a candidate is built only for the head of the line. The tests are not run again: every commit entered the line through a PR whose check was green.
- **Immutable tags.** Docker Hub keeps the tags that match `^v?[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$` unchangeable (`latest`, `sha-*` and `buildcache-*` are not). A version tag is never pushed twice: a re-run of a failed job finds the tag, checks that it is the same thing (the revision label of an image, the digest on a retag) and carries on, and fails when it is different. Candidates are deleted only by retention.
- **Backport.** After each push to a line, `backport.yml` cherry-picks the pushed change onto `develop` and opens a PR (`backport/X.Y/<sha>`; auto-merge on) with the job's own `GITHUB_TOKEN` and no other credential. The branches require signed commits, so the commit is not made with git on the runner: `git` computes the cherry-pick in a scratch clone and the result is committed through the GraphQL mutation `createCommitOnBranch`, which GitHub signs (verified); the job checks the tree and the verification, otherwise it deletes the branch, opens an issue and fails. A file mode (an executable), a symlink, a submodule or a change above 10 MiB / 300 files cannot be sent through that API and gets an issue instead, as does a pick that does not apply cleanly (with the commands to do it by hand).
- **Promote.** `promote.yml` (manual, input `rc`, `dry_run`) runs from `main` only. It refuses unless the candidate is the newest of its version, its commit is the result of a merged PR into the line (the first candidate of a line: a merged PR into `develop`), `Check passed` is green on that PR's head, and the line gate still passes; any failed lookup refuses. There is no review requirement. Then the same image gets `vX.Y.Z` by digest (no rebuild; `latest` moves when it is the newest release), the GitHub release is created as a draft and published (releases are immutable; a re-run continues from whatever state it finds, `release.sh`; the platform attaches no file), the git tag appears at the candidate's commit. Then `pages.yml` builds the static export of that commit and deploys it to GitHub Pages (environment `github-pages`). Retention runs next. Last, `main_pr.sh` pushes the branch `promote/vX.Y.Z` at the candidate's commit and opens a pull request into `main` with `GITHUB_TOKEN`, with auto-merge (merge commit); its check is `Main gate` (`main-gate.yml`, `pull_request_target`): the release tag exists and is part of `release/X.Y`, and the head IS the tagged commit or a clean merge of `main` into it (`main_gate.py`). Every other pull request into `main` fails it. A re-run of Promote finds the branch and the open pull request and continues. If the pull request conflicts, `main` was changed by hand: the job fails (the release stays published) and its summary gives the commands.
- **The line stays.** `release/X.Y` is not deleted at promote: it takes the patches. It is deleted when the next line replaces it in production.
- **Clusters** use exact tags only (`vX.Y.Z`, a candidate on staging, or a `sha-*` build for a test); `latest` is for outside users.

### Retention

The same rule applies to GitHub release pages and published images, in every repo. `cleanup.yml` applies it right after each promote (`.github/scripts/retention.sh`); run it by hand (manual, `dry_run` is on by default) after a failure.

- Git tags of final releases are kept forever, so any version can be rebuilt from source.
- Release candidates (`-rc.N`): tags, release pages and images are deleted right after the final release is promoted (and any left over from an earlier release, the old pre-releases included).
- The newest minor keeps all its patch releases and images.
- Older minors keep only their latest patch. The other patches of a minor are deleted when the next minor is released.
- Besides the newest minor, the latest patches of the 10 previous minors are kept (release page and images). An older minor drops out when it is no longer among the last 10: its release page and images are deleted, the tag stays. There are no exceptions: production always runs a current version.
- Platform: the policy applies from line 2.20 (`PRUNE_FROM`). The releases of the old numbering below 2.20 are never pruned by the workflow: the old 2.x releases, tags and images are removed by the owner once, before 2.20.0 is cut; first-generation releases (0.x and 1.x) are kept as history (`docs/internal-docs/infrastructure/specs/delivery.md`, "Retention").
- The dev images (`sha-<7>` of commits that are part of `main`) and the registry layer caches (`buildcache-release`, and the old `buildcache-develop` and `buildcache`) are deleted by the same run.

### Signed commits and immutable releases

The rulesets "Signed commits" (`main`, `develop`, `release/*`) and "Protect release tags" (`v*` except `v*-rc.*`: no update, no deletion), and "immutable releases", are on. No workflow makes a commit with git: the only commit a workflow creates is the backport, through the API; `promote/vX.Y.Z` points at the already signed candidate commit and GitHub makes the merge into `main`. Nothing bumps a version or writes release notes into git. Retention deletes a candidate's page with its tag (`gh release delete --cleanup-tag`), a final release's page without its tag, and never touches a final tag.

### Pull requests that automation opens

Events made with `GITHUB_TOKEN` do not start workflows, except `workflow_dispatch` and `repository_dispatch`. A pull request opened by Backport or by Promote does start a `pull_request` run of `check.yml` (and `main-gate.yml`), but in an *approval-required* state: a user with write access presses **Approve workflows to run** on the pull request (if the button is not there, close the pull request and reopen it). The required check must come from a `pull_request` run: GitHub does not evaluate the checks of a `workflow_dispatch` run for a pull request. After the check is green, auto-merge completes the pull request.

### Where each workflow definition comes from

The default branch is `develop`; `main` only receives promoted lines. `pull_request_target` takes the workflow and the checkout from the default branch. The Docker Hub credentials exist only as secrets of three environments, each bound to branches: `candidate` (`release/*`), `release` (`main`), `build` (`develop` and `release/*`). No other credential exists: no organisation secret, no GitHub App, no personal token.

| Workflow | Event | Definition comes from | Secrets |
|---|---|---|---|
| `line-gate.yml`, `main-gate.yml` | `pull_request_target` into `release/*` / `main` | `develop` | none |
| `check.yml`, `test.yml` | `pull_request` into `develop`, `release/*` | the merge commit of the pull request | none |
| `candidate.yml` | push to `release/X.Y`, or manual | the line | environment `candidate` |
| `backport.yml` | push to `release/X.Y` | the line | none (job token only) |
| `promote.yml`, `cleanup.yml`, `pages.yml` | manual (`--ref main`, a first step stops any other ref) | `main` | environment `release` (and `github-pages` for the site) |
| `build.yml` | manual | the chosen ref (`develop` by default) | environment `build` |

### Settings in GitHub that the workflows rely on

- Default branch `develop`. Environments `candidate` (deployment branches `release/*`), `release` (`main`), `build` (`develop`, `release/*`), each with `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` only (`mise run ci-secrets` in `infrastructure` puts them there); `github-pages` must allow `main`.
- Rulesets: `release/*` (creation and deletion by the owner only, pull request required, required checks `Check passed` and `Line gate`, no force push), `develop` (required check `Check passed`), `main` (pull request required, required check `Main gate`, added after the bootstrap merge).
- Actions: "Allow GitHub Actions to create and approve pull requests" on, auto-merge allowed. Label `large-fix`.
- A promote is started with `gh workflow run promote.yml --ref main -f rc=...` (the release tool of `infrastructure` does it).

### Bootstrap

The scripts that decide are read from `main`, and the environment `release` only runs on `main`, so `promote.yml`, `cleanup.yml`, `pages.yml`, `main-gate.yml`, everything under `.github/scripts` and `mise.toml` must be on `main` before the first promote. They get there once through an ordinary pull request `develop` into `main`, merged by the owner, before `Main gate` becomes a required check of `main` (it fails that pull request by design). After that `main` is updated only by the pull requests of Promote.
