import { DescribeTasksCommand, ECSClient, ListTasksCommand } from "@aws-sdk/client-ecs";
import { DescribeNetworkInterfacesCommand, EC2Client } from "@aws-sdk/client-ec2";
import {
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
  Route53Client,
} from "@aws-sdk/client-route-53";
import { networkInterfaceId, pickOriginTask } from "./pickOrigin";

// CloudFront reaches the API container by a DNS name (CloudFront can't use a bare IP), but a
// Fargate task's public IP changes every time a task starts. This keeps that name pointed at the
// task that should take traffic. It runs on every task state change of the service and once per
// deploy (sst.config.ts), and works from the live state each time, so the order or repetition of
// events doesn't matter.

const { CLUSTER, SERVICE, ZONE_ID, RECORD_NAME } = process.env as Record<string, string>;
const TTL = 30;

const ecs = new ECSClient({});
const ec2 = new EC2Client({});
const route53 = new Route53Client({});

export async function handler() {
  const { taskArns = [] } = await ecs.send(
    new ListTasksCommand({ cluster: CLUSTER, serviceName: SERVICE, desiredStatus: "RUNNING" }),
  );
  if (taskArns.length === 0) return { updated: false, reason: "no running task" };

  const { tasks = [] } = await ecs.send(new DescribeTasksCommand({ cluster: CLUSTER, tasks: taskArns }));
  const task = pickOriginTask(tasks);
  const eni = task && networkInterfaceId(task);
  if (!eni) return { updated: false, reason: "no running task with a network interface" };

  const { NetworkInterfaces = [] } = await ec2.send(
    new DescribeNetworkInterfacesCommand({ NetworkInterfaceIds: [eni] }),
  );
  const ip = NetworkInterfaces[0]?.Association?.PublicIp;
  if (!ip) throw new Error(`Task ${task.taskArn} has no public IP`);

  const current = await currentIp();
  if (current === ip) return { updated: false, ip };

  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: ZONE_ID,
      ChangeBatch: {
        Changes: [
          {
            Action: "UPSERT",
            ResourceRecordSet: { Name: RECORD_NAME, Type: "A", TTL, ResourceRecords: [{ Value: ip }] },
          },
        ],
      },
    }),
  );
  console.log(`Pointed ${RECORD_NAME} at ${ip} (task ${task.taskArn}), was ${current}`);
  return { updated: true, ip };
}

async function currentIp() {
  const { ResourceRecordSets = [] } = await route53.send(
    new ListResourceRecordSetsCommand({
      HostedZoneId: ZONE_ID,
      StartRecordName: RECORD_NAME,
      StartRecordType: "A",
      MaxItems: 1,
    }),
  );
  const record = ResourceRecordSets[0];
  const sameName = record?.Name?.replace(/\.$/, "") === RECORD_NAME.replace(/\.$/, "");
  return sameName && record.Type === "A" ? record.ResourceRecords?.[0]?.Value : undefined;
}
