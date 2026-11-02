# Project notes

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
