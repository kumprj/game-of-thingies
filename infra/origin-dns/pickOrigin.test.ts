import { describe, expect, it } from "vitest";
import { networkInterfaceId, pickOriginTask, type OriginTask } from "./pickOrigin";

const task = (id: string, startedAt: number, extra: Partial<OriginTask> = {}) => ({
  id,
  lastStatus: "RUNNING",
  desiredStatus: "RUNNING",
  healthStatus: "HEALTHY",
  startedAt: new Date(startedAt),
  ...extra,
});

describe("pickOriginTask", () => {
  it("returns nothing when no task is running", () => {
    expect(pickOriginTask([])).toBeUndefined();
    expect(pickOriginTask([task("a", 1, { lastStatus: "PROVISIONING" })])).toBeUndefined();
  });

  it("keeps traffic on the old task until the new one is healthy", () => {
    const old = task("old", 1);
    const fresh = task("new", 2, { healthStatus: "UNKNOWN" });
    expect(pickOriginTask([old, fresh])?.id).toBe("old");
    expect(pickOriginTask([old, { ...fresh, healthStatus: "HEALTHY" }])?.id).toBe("new");
  });

  it("skips a task ECS is stopping", () => {
    const stopping = task("stopping", 2, { desiredStatus: "STOPPED" });
    expect(pickOriginTask([task("keep", 1), stopping])?.id).toBe("keep");
  });

  it("falls back to the newest running task when none is healthy", () => {
    const a = task("a", 1, { healthStatus: "UNKNOWN" });
    const b = task("b", 2, { healthStatus: "UNHEALTHY" });
    expect(pickOriginTask([a, b])?.id).toBe("b");
  });
});

describe("networkInterfaceId", () => {
  it("reads the ENI from the task's attachment", () => {
    expect(
      networkInterfaceId({
        attachments: [
          {
            type: "ElasticNetworkInterface",
            details: [
              { name: "subnetId", value: "subnet-1" },
              { name: "networkInterfaceId", value: "eni-123" },
            ],
          },
        ],
      }),
    ).toBe("eni-123");
    expect(networkInterfaceId({ attachments: [] })).toBeUndefined();
  });
});
