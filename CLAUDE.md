# Project notes

## Prefer the lowest-cost AWS design
For AWS architecture and deployment changes, choose the lowest recurring-cost option that meets
the current requirements for correctness, security, reliability, and maintainability. Prefer
request-priced or scale-to-zero services for intermittent workloads, and document any material
cost-versus-experience tradeoff in the PR.

## Keep Web and iOS in sync
Always make updates for both iOS and Web. When implementing game features, UI changes, networking, or bug fixes, keep the web client (`client/`) and iOS client (`apps/ios/`) aligned and supported across both platforms.

## Never commit sensitive or personal values
This repo is public, and `main` auto-deploys to production. Before every commit or push, check
`git diff --cached` for:
- Secrets: API keys, tokens, passwords, AWS credentials, `.env` files.
- Apple signing details: `DEVELOPMENT_TEAM` IDs, provisioning profiles, certificates. Xcode adds
  `DEVELOPMENT_TEAM` to `apps/ios/GameOfThings.xcodeproj/project.pbxproj` when building to a
  device; leave it out (revert that hunk, or `git add -p`).
- Personal info: email addresses, account IDs, local absolute paths.

If something sensitive was already committed, tell the user. Don't just add a removal commit,
because it stays in history. Rewrite the unmerged branch instead, and confirm with the user before
force-pushing.

## Every feature ships on web and iOS, with tests
- Build each feature on both the web client (`client/`) and the iOS app (`apps/ios/`) in the same PR
  or stack. If one platform can't land yet, file and link a follow-up issue before merging.
- Add unit tests on each platform you touch, and an integration test for any server change
  (`server/integration/`, run against DynamoDB Local).
- Build iOS only. Never launch the iOS Simulator; the iOS tests run in CI (`ios.yml`).

## Branches and worktrees
- Work on a separate branch from `main`, never on someone else's open branch.
- Stacked PRs: base each PR on the previous branch and link them with `gh stack link`.
- After a PR merges, remove its worktree (`git worktree remove`) and delete its local and remote
  branch.
