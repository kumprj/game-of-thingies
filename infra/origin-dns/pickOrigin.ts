/** The fields of an ECS task (DescribeTasks) that decide which one CloudFront should reach. */
export interface OriginTask {
  lastStatus?: string;
  desiredStatus?: string;
  healthStatus?: string;
  startedAt?: Date;
  attachments?: { type?: string; details?: { name?: string; value?: string }[] }[];
}

/**
 * Picks the task that should take traffic: the newest healthy task that ECS means to keep
 * running, or the newest running one if none is healthy yet (a cold start, or a deploy that lost
 * the old task). During a deploy this keeps traffic on the old task until the new one passes its
 * health check, then moves it.
 */
export function pickOriginTask<T extends OriginTask>(tasks: T[]): T | undefined {
  const live = tasks
    .filter((t) => t.lastStatus === "RUNNING" && t.desiredStatus === "RUNNING")
    .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
  return live.find((t) => t.healthStatus === "HEALTHY") ?? live[0];
}

/** The ID of the network interface Fargate gave the task (awsvpc mode). */
export function networkInterfaceId(task: OriginTask): string | undefined {
  return task.attachments
    ?.find((a) => a.type === "ElasticNetworkInterface")
    ?.details?.find((d) => d.name === "networkInterfaceId")?.value;
}
