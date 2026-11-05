import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_cloudwatch as cloudwatch,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";

export interface PikaloStackProps extends StackProps {
  vercelTeamSlug: string;
  vercelProject: string;
  githubRepo: string;
  /** An AWS account can hold only one GitHub OIDC provider; set false if it already exists. */
  createGithubOidcProvider: boolean;
}

/**
 * Pikalo's AWS side:
 * - S3 archive of every IRS page version we ingested
 * - Weekly Lambda: fetch → chunk → embed (Bedrock Titan) → upsert to Supabase
 * - Vercel OIDC role that can only call the embedding model (query time)
 * - GitHub OIDC role that can only deploy this stack
 * No long-lived AWS keys anywhere.
 */
export class PikaloStack extends Stack {
  constructor(scope: Construct, id: string, props: PikaloStackProps) {
    super(scope, id, props);

    const embeddingModelArn = `arn:${this.partition}:bedrock:${this.region}::foundation-model/${EMBEDDING_MODEL_ID}`;

    const bucket = new s3.Bucket(this, "RawPages", {
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(365) }],
    });

    const supabaseSecret = new secretsmanager.Secret(this, "SupabaseIngestSecret", {
      description:
        'Set to {"SUPABASE_URL":"...","SUPABASE_SERVICE_ROLE_KEY":"..."} in the console. Used only by the ingest Lambda.',
    });

    const logGroup = new logs.LogGroup(this, "IngestLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const ingest = new nodejs.NodejsFunction(this, "IngestFn", {
      entry: path.join(here, "../lambda/ingest.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.minutes(15),
      reservedConcurrentExecutions: 1,
      logGroup,
      environment: {
        BUCKET: bucket.bucketName,
        SECRET_ARN: supabaseSecret.secretArn,
        BEDROCK_MODEL_ID: EMBEDDING_MODEL_ID,
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node22",
        minify: true,
        sourceMap: true,
        externalModules: ["@aws-sdk/*"],
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    });

    bucket.grantReadWrite(ingest);
    supabaseSecret.grantRead(ingest);
    ingest.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [embeddingModelArn],
      }),
    );

    new events.Rule(this, "WeeklyIngest", {
      description: "Re-ingest IRS pages every Monday 09:00 UTC",
      schedule: events.Schedule.cron({ weekDay: "MON", hour: "9", minute: "0" }),
      targets: [new targets.LambdaFunction(ingest, { retryAttempts: 2 })],
    });

    new cloudwatch.Alarm(this, "IngestErrors", {
      alarmDescription: "Weekly IRS ingestion failed",
      metric: ingest.metricErrors({ period: Duration.days(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Vercel → AWS for query embeddings. Only the Pikalo project's
    // production and preview deployments, only the one model.
    const vercelIssuer = `oidc.vercel.com/${props.vercelTeamSlug}`;
    const vercelProvider = new iam.OpenIdConnectProvider(this, "VercelOidc", {
      url: `https://${vercelIssuer}`,
      clientIds: [`https://vercel.com/${props.vercelTeamSlug}`],
    });
    const vercelRole = new iam.Role(this, "VercelQueryRole", {
      description: "Assumed by the Pikalo Vercel app to embed user questions",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(vercelProvider.openIdConnectProviderArn, {
        StringEquals: {
          [`${vercelIssuer}:aud`]: `https://vercel.com/${props.vercelTeamSlug}`,
        },
        StringLike: {
          [`${vercelIssuer}:sub`]: [
            `owner:${props.vercelTeamSlug}:project:${props.vercelProject}:environment:production`,
            `owner:${props.vercelTeamSlug}:project:${props.vercelProject}:environment:preview`,
          ],
        },
      }),
    });
    vercelRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [embeddingModelArn],
      }),
    );

    // GitHub Actions → AWS for `cdk deploy` from main only.
    const githubIssuer = "token.actions.githubusercontent.com";
    const githubProviderArn = props.createGithubOidcProvider
      ? new iam.OpenIdConnectProvider(this, "GithubOidc", {
          url: `https://${githubIssuer}`,
          clientIds: ["sts.amazonaws.com"],
        }).openIdConnectProviderArn
      : `arn:${this.partition}:iam::${this.account}:oidc-provider/${githubIssuer}`;
    const deployRole = new iam.Role(this, "GithubDeployRole", {
      description: "Assumed by GitHub Actions on main to run cdk deploy",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(githubProviderArn, {
        StringEquals: {
          [`${githubIssuer}:aud`]: "sts.amazonaws.com",
          [`${githubIssuer}:sub`]: `repo:${props.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*`],
      }),
    );

    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new CfnOutput(this, "SupabaseSecretArn", { value: supabaseSecret.secretArn });
    new CfnOutput(this, "IngestFunctionName", { value: ingest.functionName });
    new CfnOutput(this, "VercelRoleArn", { value: vercelRole.roleArn });
    new CfnOutput(this, "GithubDeployRoleArn", { value: deployRole.roleArn });
  }
}
