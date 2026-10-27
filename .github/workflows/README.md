# Workflows

- `ci.yml` runs on every pull request: server typecheck, client build, unit tests, integration tests against DynamoDB Local, and a Docker image check.
- `ios.yml` runs the iOS tests when a pull request touches `apps/ios/`.
- `deploy.yml` deploys production with `npx sst deploy --stage production` on every merge to main (see `sst.config.ts`).

Old games clean themselves up: every write sets `expiresAt` a day ahead, and DynamoDB's TTL deletes the item once it passes.
