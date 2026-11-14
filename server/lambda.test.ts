import {describe, expect, it} from "vitest";

describe("Lambda HTTP adapter", () => {
  it("serves the health endpoint through an API Gateway v2 event", async () => {
    Object.assign(process.env, {
      GAMES_TABLE: "Games",
      ENTRIES_TABLE: "Entries",
      SCORES_TABLE: "Scores",
    });
    const {handler} = await import("./lambda.js");
    const invoke = handler as unknown as (
      event: object,
      context: object,
    ) => Promise<{statusCode: number; body: string}>;
    const result = await invoke({
      version: "2.0",
      routeKey: "$default",
      rawPath: "/health",
      rawQueryString: "",
      headers: {},
      requestContext: {
        accountId: "test",
        apiId: "test",
        domainName: "test.execute-api.us-east-1.amazonaws.com",
        domainPrefix: "test",
        http: {
          method: "GET",
          path: "/health",
          protocol: "HTTP/1.1",
          sourceIp: "127.0.0.1",
          userAgent: "vitest",
        },
        requestId: "test",
        routeKey: "$default",
        stage: "$default",
        time: "01/Jan/2026:00:00:00 +0000",
        timeEpoch: 0,
      },
      isBase64Encoded: false,
    }, {});

    expect(result).toMatchObject({statusCode: 200, body: "OK"});
  });
});
