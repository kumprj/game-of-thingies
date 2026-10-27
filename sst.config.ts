/// <reference path="./.sst/platform/config.d.ts" />

// Everything Game of Things runs on: the DynamoDB tables, the Express + Socket.IO server and the
// web client. `npx sst deploy --stage production` ships production (CI does this on every merge to
// main); `npx sst dev` gives you a personal stage with its own tables and runs the server and
// Vite locally against them.
export default $config({
  app(input) {
    return {
      name: "game-of-things",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: input?.stage === "production",
      home: "aws",
      providers: { aws: { region: "us-east-1" } },
    };
  },
  async run() {
    const production = $app.stage === "production";

    // Production keeps the tables it has always used (created by cfn_tables.yml), so no data
    // moves. Every other stage gets its own empty copies, so development never touches them.
    const games = production
      ? sst.aws.Dynamo.get("Games", "Games")
      : new sst.aws.Dynamo("Games", {
          fields: { gameId: "string" },
          primaryIndex: { hashKey: "gameId" },
        });
    const entries = production
      ? sst.aws.Dynamo.get("Entries", "Entries")
      : new sst.aws.Dynamo("Entries", {
          fields: { gameId: "string", entryId: "string" },
          primaryIndex: { hashKey: "gameId", rangeKey: "entryId" },
        });
    const scores = production
      ? sst.aws.Dynamo.get("Scores", "Scores")
      : new sst.aws.Dynamo("Scores", {
          fields: { gameId: "string", playerName: "string" },
          primaryIndex: { hashKey: "gameId", rangeKey: "playerName" },
        });

    const zone = "gameofthings.fun";
    const webDomain = production ? zone : `${$app.stage}.${zone}`;
    const apiDomain = production ? `api.${zone}` : `api-${$app.stage}.${zone}`;

    // No NAT: the container sits in a public subnet with its own public IP, which is all it needs
    // to reach DynamoDB, and saves a NAT's monthly cost.
    const vpc = new sst.aws.Vpc("Vpc");
    const cluster = new sst.aws.Cluster("Cluster", { vpc });

    // One always-on container, so there are no cold starts. Socket.IO rooms live in its memory,
    // so a second container would need sticky sessions and a shared adapter (Redis) first.
    const api = new sst.aws.Service("Api", {
      cluster,
      architecture: "arm64",
      image: { context: ".", dockerfile: "Dockerfile" },
      // The link grants the task role access; the names reach the server as plain env vars.
      link: [games, entries, scores],
      environment: {
        GAMES_TABLE: games.name,
        ENTRIES_TABLE: entries.name,
        SCORES_TABLE: scores.name,
      },
      loadBalancer: {
        domain: apiDomain,
        rules: [
          { listen: "80/http", redirect: "443/https" },
          { listen: "443/https", forward: "3001/http" },
        ],
        health: { "3001/http": { path: "/health" } },
      },
      dev: {
        url: "http://localhost:3001",
        command: "npx tsx watch server/index.ts",
        directory: ".",
      },
    });

    const web = new sst.aws.StaticSite("Web", {
      path: "client",
      build: { command: "npm run build", output: "dist" },
      environment: { VITE_API_URL: api.url },
      // override: true replaces the records Amplify left for gameofthings.fun and www
      domain: production
        ? { name: zone, redirects: [`www.${zone}`], dns: sst.aws.dns({ override: true }) }
        : webDomain,
      dev: { command: "npm start" },
    });

    return { web: web.url, api: api.url };
  },
});
