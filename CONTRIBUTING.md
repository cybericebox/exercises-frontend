# Contributing

`main` holds releases, `develop` is the integration branch. Nobody pushes to either directly (branch protection applies to admins too): every change is a feature branch and a pull request.

## The cycle

1. `mise run dev-start <x>`: fetches `develop` and creates `feature/<x>` from it.
2. Work and commit in that branch.
3. `[MINOR=1] mise run dev-push`: pushes the branch (it refuses on `develop` and `main` and warns about uncommitted changes), opens a PR into `develop` or updates the open one, labels it `minor` with `MINOR=1`, and turns on auto-merge: the PR merges by itself once every check is green.
4. After the merge GitHub deletes the remote branch. `mise run dev-done` switches to `develop`, pulls it and deletes the local branch.

The tasks use `scripts/dev.sh` and need the `gh` CLI, logged in.

## Checks and images

- A PR into `develop` or `main` runs `check.yml`: lint, typecheck and tests, and the Docker build, which writes its layers to the registry cache `cybericebox/exercises-frontend:buildcache-develop` (read by `Build image` and the release workflows) and publishes nothing. A new push cancels the previous run. A PR from a fork builds without the cache. The required check is `Check passed`.
- A merge into `develop` publishes nothing: no image, no tag. An image of any commit is built on demand with `Build image`.
- `Build image` (`build.yml`, manual) builds any commit, by default the `develop` head, reading the `buildcache-develop` cache, and publishes its `sha-<7>`. When that image exists it is not rebuilt.

## Dependency updates

Dependabot opens version updates every Monday morning (Kyiv time), into the default branch (`develop`). Minor and patch updates are grouped: one pull request per ecosystem and kind per week. Major updates come as separate pull requests, so they stay visible. Config: `.github/dependabot.yml`.

- A pull request with only patch updates merges itself into `develop` once the required checks are green (`.github/workflows/dependabot-auto-merge.yml`).
- Anything with a minor or a major update waits for the owner: review it, fix what breaks, merge it.
- Security fixes come as one grouped pull request per ecosystem (the `*-security` group), not one per package. Critical and high ones are handled the same day. A security pull request with at most minor updates merges itself like a patch one; a major waits for the owner. If production needs the fix, it ships through the release line as a patch.
- A Dependabot check that fails on a secret means a workflow step uses a repository secret: Dependabot runs get none, so such steps are skipped for it.

## Releases

- A merge of `develop` into `main` (`prerelease.yml`) publishes `vX.Y.Z-rc.N` and creates the GitHub pre-release. The version is a patch bump of the last release; it is a minor bump when any PR merged since then has the `minor` label; a major bump only through a manual run with `major`. Nothing is built when the tree is unchanged since the last rc. The rc is a retag of the develop image (no build) when the tree of `main` equals the tree of the develop head (the second parent of the merge) and that head has its `sha-<7>` image; otherwise it is built, reading the `buildcache-develop` cache.
- `Promote` (`promote.yml`, manual, input: the rc tag) checks the rc image and its checks, adds `vX.Y.Z` and `latest` to the same image without a rebuild, creates the GitHub release, deploys the site to GitHub Pages (before anything is deleted), deletes the `vX.Y.Z-rc.*` tags and pre-releases, and deletes the dev images: only tags that match `^sha-[0-9a-f]{7}$` whose commit is an ancestor of the release commit, plus the `buildcache-develop` and old `buildcache` cache tags (the next PR starts with a cold cache). The list is printed first; the `dry_run` input changes nothing.
- `Cleanup` (`cleanup.yml`, manual, inputs: the release `vX.Y.Z` and `dry_run`) runs the same dev-image cleanup against an existing release commit, for example when it was skipped.
- Clusters and the chart use exact tags only (`sha-*` or `vX.Y.Z`); `latest` is for outside users.

### Retention

The same rule applies to GitHub release pages and published images, in every repo.

- Git tags of final releases are kept forever, so any version can be rebuilt from source.
- Release candidates (`-rc.N`): tags, release pages and images are deleted right after the final release is promoted.
- The newest minor keeps all its patch releases and images.
- Older minors keep only their latest patch. The other patches of a minor are deleted when the next minor is released.
- Besides the newest minor, the latest patches of the 10 previous minors are kept (release page and images). An older minor drops out when it is no longer among the last 10: its release page and images are deleted, the tag stays. There are no exceptions: production always runs a current version.
- Pruning runs automatically in the release workflow. Manual cleanup is done only once, when the policy is introduced.
