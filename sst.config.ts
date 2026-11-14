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
    // Both delete an item a day after its last write, using the expiresAt the server sets.
    const games = production
      ? sst.aws.Dynamo.get("Games", "Games")
      : new sst.aws.Dynamo("Games", {
          fields: { gameId: "string" },
          primaryIndex: { hashKey: "gameId" },
          ttl: "expiresAt",
        });
    const entries = production
      ? sst.aws.Dynamo.get("Entries", "Entries")
      : new sst.aws.Dynamo("Entries", {
          fields: { gameId: "string", entryId: "string" },
          primaryIndex: { hashKey: "gameId", rangeKey: "entryId" },
          ttl: "expiresAt",
        });
    const scores = production
      ? sst.aws.Dynamo.get("Scores", "Scores")
      : new sst.aws.Dynamo("Scores", {
          fields: { gameId: "string", playerName: "string" },
          primaryIndex: { hashKey: "gameId", rangeKey: "playerName" },
          ttl: "expiresAt",
        });

    // Apple Push Notification service credentials for "it's your turn" pushes and Live Activities on
    // iOS (#71). Until they are set the server leaves push off and games work as before. The values
    // stay out of the repo: `npx sst secret set ApnsKey --stage production < AuthKey_XXXXXXXXXX.p8`,
    // and the same for ApnsKeyId (the key's 10-character id) and ApnsTeamId (your Apple team id).
    const apnsKey = new sst.Secret("ApnsKey", "unset");
    const apnsKeyId = new sst.Secret("ApnsKeyId", "unset");
    const apnsTeamId = new sst.Secret("ApnsTeamId", "unset");

    const zone = "gameofthings.fun";
    const webDomain = production ? zone : `${$app.stage}.${zone}`;
    const apiDomain = production ? `api.${zone}` : `api-${$app.stage}.${zone}`;

    // The API is request-priced Lambda compute rather than an always-on container. API Gateway is
    // kept behind the existing CloudFront distribution so api.gameofthings.fun does not move.
    const api = new sst.aws.ApiGatewayV2("Api", {
      link: [games, entries, scores],
      accessLog: { retention: "1 week" },
    });
    api.route("$default", {
      handler: "server/lambda.handler",
      architecture: "arm64",
      timeout: "30 seconds",
      environment: {
        GAMES_TABLE: games.name,
        ENTRIES_TABLE: entries.name,
        SCORES_TABLE: scores.name,
        APNS_KEY: apnsKey.value,
        APNS_KEY_ID: apnsKeyId.value,
        APNS_TEAM_ID: apnsTeamId.value,
        APNS_TOPIC: "com.kumprj.GameOfThings",
      },
    });

    // `sst dev` runs the server locally, so the deployed front door only exists outside dev.
    if (!$dev) createApiFrontDoor();

    function createApiFrontDoor() {
      new sst.aws.Cdn("ApiCdn", {
        comment: `Game of Things API (${$app.stage})`,
        domain: { name: apiDomain, dns: sst.aws.dns() },
        transform: {
          // The api records depend on the distribution, so this holds them back until CloudFront
          // can serve it. Otherwise they switch over while the distribution is still deploying,
          // and resolvers cache the empty answer they get for up to 15 minutes (the zone's SOA).
          distribution: (args) => {
            args.waitForDeployment = true;
          },
        },
        origins: [
          {
            originId: "api",
            domainName: api.url.apply((url) => new URL(url).hostname),
            customOriginConfig: {
              httpPort: 80,
              httpsPort: 443,
              originProtocolPolicy: "https-only",
              originSslProtocols: ["TLSv1.2"],
            },
          },
        ],
        defaultCacheBehavior: {
          targetOriginId: "api",
          viewerProtocolPolicy: "redirect-to-https",
          allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
          cachedMethods: ["GET", "HEAD"],
          // Managed policies: no caching, and forward request data without replacing the API
          // Gateway origin's Host header.
          cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // CachingDisabled
          originRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac", // AllViewerExceptHostHeader
          compress: true,
        },
      });
    }

    const web = new sst.aws.StaticSite("Web", {
      path: "client",
      build: { command: "npm run build", output: "dist" },
      environment: { VITE_API_URL: $dev ? api.url : `https://${apiDomain}` },
      // override: true replaces the records Amplify left for gameofthings.fun and www
      domain: production
        ? { name: zone, redirects: [`www.${zone}`], dns: sst.aws.dns({ override: true }) }
        : webDomain,
      dev: { command: "npm start" },
    });

    return { web: web.url, api: $dev ? api.url : `https://${apiDomain}` };
  },
});
