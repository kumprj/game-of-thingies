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

    // Until the load balancer was replaced, the Api service owned the api domain's A/AAAA records
    // and its certificate's validation CNAME. Aliasing the ApiCdn's records to those makes Pulumi
    // update them in place. Otherwise it would create the new records over the old ones and then
    // delete the old ones by name, deleting the new records with them. (A resource transform, not
    // sst.aws.dns's transform: that one shares one options object across the component's
    // resources, so an alias set there leaks onto the next one.)
    $util.runtime.registerResourceTransform(({ type, name, props, opts }) => {
      if (type !== "aws:route53/record:Record" || !name.startsWith("ApiCdn")) return undefined;
      const parents = name.startsWith("ApiCdnSsl")
        ? "sst:aws:Service$sst:aws:Certificate"
        : "sst:aws:Service";
      const oldName = name.replace(/^ApiCdn/, "Api");
      const alias = `urn:pulumi:${$app.stage}::${$app.name}::${parents}$aws:route53/record:Record::${oldName}`;
      return { props, opts: { ...opts, aliases: [...(opts.aliases ?? []), alias] } };
    });

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

    // No NAT: the container sits in a public subnet with its own public IP, which is all it needs
    // to reach DynamoDB, and saves a NAT's monthly cost. Its security group already allows traffic
    // from inside the VPC; this adds CloudFront (and only CloudFront) on the server's port.
    const cloudfrontOrigins = aws.ec2.getManagedPrefixListOutput({
      name: "com.amazonaws.global.cloudfront.origin-facing",
    });
    const vpc = new sst.aws.Vpc("Vpc", {
      transform: {
        securityGroup: (args) => {
          args.ingress = $output(args.ingress).apply((rules) => [
            ...(rules ?? []),
            { protocol: "tcp", fromPort: 3001, toPort: 3001, prefixListIds: [cloudfrontOrigins.id] },
          ]);
        },
      },
    });
    const cluster = new sst.aws.Cluster("Cluster", { vpc });

    // One always-on container, so there are no cold starts. Socket.IO rooms live in its memory,
    // so a second container would need sticky sessions and a shared adapter (Redis) first.
    // CloudFront (below) fronts it instead of a load balancer, which cost more than the container.
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
        APNS_KEY: apnsKey.value,
        APNS_KEY_ID: apnsKeyId.value,
        APNS_TEAM_ID: apnsTeamId.value,
        APNS_TOPIC: "com.kumprj.GameOfThings", // the iOS app's bundle id
      },
      // Lets ECS replace a stuck container, and lets a deploy (and the origin DNS below) wait for
      // the new container to answer before it takes traffic. busybox wget ships with node:alpine.
      health: {
        command: ["CMD-SHELL", "wget -q -O /dev/null http://localhost:3001/health || exit 1"],
        startPeriod: "10 seconds",
        interval: "10 seconds",
        timeout: "5 seconds",
        retries: 3,
      },
      dev: {
        url: "http://localhost:3001",
        command: "npx tsx watch server/index.ts",
        directory: ".",
      },
    });

    // `sst dev` runs the server locally, so the deployed front door only exists outside dev.
    if (!$dev) createApiFrontDoor();

    function createApiFrontDoor() {
      // CloudFront needs a DNS name for its origin, but the task's public IP changes whenever a
      // task starts. infra/origin-dns keeps this record pointed at the task that should take
      // traffic; Pulumi only creates and deletes it (the placeholder IP never serves).
      const hostedZone = aws.route53.getZoneOutput({ name: zone });
      const originDomain = production ? `origin-api.${zone}` : `origin-api-${$app.stage}.${zone}`;
      const originRecord = new aws.route53.Record(
        "ApiOriginRecord",
        {
          zoneId: hostedZone.zoneId,
          name: originDomain,
          type: "A",
          ttl: 30,
          records: ["192.0.2.1"],
        },
        { ignoreChanges: ["records"] },
      );

      const clusterName = cluster.nodes.cluster.name;
      const service = api.nodes.service;
      const originDns = new sst.aws.Function("ApiOriginDns", {
        handler: "infra/origin-dns/handler.handler",
        architecture: "arm64",
        timeout: "30 seconds",
        environment: {
          CLUSTER: clusterName,
          SERVICE: service.name,
          ZONE_ID: hostedZone.zoneId,
          RECORD_NAME: originRecord.fqdn,
        },
        permissions: [
          { actions: ["ecs:ListTasks", "ecs:DescribeTasks", "ec2:DescribeNetworkInterfaces"], resources: ["*"] },
          {
            actions: ["route53:ChangeResourceRecordSets", "route53:ListResourceRecordSets"],
            resources: [$interpolate`arn:aws:route53:::hostedzone/${hostedZone.zoneId}`],
          },
        ],
      });

      // Every task state change of the service (started, healthy, stopped) re-syncs the record
      const defaultBus = $interpolate`arn:aws:events:${aws.getRegionOutput().region}:${aws.getCallerIdentityOutput().accountId}:event-bus/default`;
      sst.aws.Bus.subscribe("ApiOriginDnsOnTaskChange", defaultBus, originDns, {
        pattern: {
          source: ["aws.ecs"],
          detailType: ["ECS Task State Change"],
          detail: { clusterArn: [cluster.nodes.cluster.arn], group: [$interpolate`service:${service.name}`] },
        },
      });
      // And once per deploy, which covers the first deploy (the task can start before the
      // subscription exists) and any event that was missed.
      new aws.lambda.Invocation(
        "ApiOriginDnsSync",
        {
          functionName: originDns.name,
          input: JSON.stringify({}),
          triggers: { taskDefinition: api.nodes.taskDefinition.arn },
        },
        { dependsOn: [service] },
      );

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
            domainName: originRecord.fqdn,
            customOriginConfig: {
              httpPort: 3001,
              httpsPort: 443,
              // The container serves plain HTTP; CloudFront terminates TLS for clients
              originProtocolPolicy: "http-only",
              originSslProtocols: ["TLSv1.2"],
              // Above Socket.IO's 25s long-polling hold (WebSockets aren't subject to it)
              originReadTimeout: 60,
            },
          },
        ],
        defaultCacheBehavior: {
          targetOriginId: "api",
          viewerProtocolPolicy: "redirect-to-https",
          allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
          cachedMethods: ["GET", "HEAD"],
          // Managed policies: no caching, and every header, cookie and query string goes to the
          // server (Socket.IO needs its query string and the WebSocket upgrade headers).
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
