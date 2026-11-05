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

/**
 * Chat models the gateway may call. US cross-region inference profiles route
 * to these three regions, so the role needs the profile and each regional
 * foundation model.
 */
export const CHAT_MODELS = ["amazon.nova-micro-v1:0", "amazon.nova-lite-v1:0"];
const US_PROFILE_REGIONS = ["us-east-1", "us-east-2", "us-west-2"];
export const chatProfileId = (model: string) => `us.${model}`;

export interface OidcProps {
  vercelTeamSlug: string;
  vercelProject: string;
  githubRepo: string;
  /** An AWS account can hold only one GitHub OIDC provider; set false if it already exists. */
  createGithubOidcProvider: boolean;
}

export interface PikaloStackProps extends StackProps {
  /**
   * OIDC roles for Vercel and GitHub. Off when the account's org policy denies
   * iam:CreateOpenIDConnectProvider (as AWS "new experience" accounts do);
   * the app then reaches AWS only through the HMAC-signed embed URL.
   */
  oidc?: OidcProps;
}

const bundling: nodejs.BundlingOptions = {
  format: nodejs.OutputFormat.ESM,
  target: "node22",
  minify: true,
  sourceMap: true,
  externalModules: ["@aws-sdk/*"],
  banner:
    "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
};

/**
 * Pikalo's AWS side:
 * - S3 archive of every IRS page version we ingested
 * - Weekly Lambda: fetch → chunk → embed (Bedrock Titan) → upsert to Supabase
 * - Embed Lambda behind an HMAC-signed function URL (query time, from Vercel)
 * - Optional OIDC roles for Vercel and GitHub
 * No long-lived AWS keys anywhere.
 */
export class PikaloStack extends Stack {
  constructor(scope: Construct, id: string, props: PikaloStackProps = {}) {
    super(scope, id, props);

    const embeddingModelArn = `arn:${this.partition}:bedrock:${this.region}::foundation-model/${EMBEDDING_MODEL_ID}`;
    const invokeEmbeddingModel = () =>
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [embeddingModelArn],
      });

    // ---------- Ingestion ----------

    const bucket = new s3.Bucket(this, "RawPages", {
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(365) }],
    });

    const supabaseSecret = new secretsmanager.Secret(this, "SupabaseIngestSecret", {
      // Placeholder JSON; the real values are pasted in after deploy.
      generateSecretString: {
        secretStringTemplate: "{}",
        generateStringKey: "placeholder",
      },
      description:
        'Set to {"SUPABASE_URL":"...","SUPABASE_SERVICE_ROLE_KEY":"..."} in the console. Used only by the ingest Lambda.',
    });

    const ingest = new nodejs.NodejsFunction(this, "IngestFn", {
      entry: path.join(here, "../lambda/ingest.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      // No reserved concurrency: new accounts (limit 10) reject any reservation,
      // and the single weekly rule already means one run at a time.
      timeout: Duration.minutes(15),
      logGroup: new logs.LogGroup(this, "IngestLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        BUCKET: bucket.bucketName,
        SECRET_ARN: supabaseSecret.secretArn,
        BEDROCK_MODEL_ID: EMBEDDING_MODEL_ID,
      },
      bundling,
    });

    // Read (incl. ListBucket, so a missing key is NoSuchKey not AccessDenied)
    // and put. No delete: the archive is append-only.
    bucket.grantRead(ingest);
    bucket.grantPut(ingest);
    supabaseSecret.grantRead(ingest);
    ingest.addToRolePolicy(invokeEmbeddingModel());

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

    // ---------- Query-time embeddings ----------

    const signingSecret = new secretsmanager.Secret(this, "EmbedSigningSecret", {
      description:
        "HMAC key shared by the Vercel app (EMBED_SIGNING_SECRET) and the embed Lambda",
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });

    const embedFn = new nodejs.NodejsFunction(this, "EmbedFn", {
      entry: path.join(here, "../lambda/embed.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(30),
      logGroup: new logs.LogGroup(this, "EmbedLogs", {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        SIGNING_SECRET_ARN: signingSecret.secretArn,
        BEDROCK_MODEL_ID: EMBEDDING_MODEL_ID,
        CHAT_MODEL_ALLOWLIST: CHAT_MODELS.map(chatProfileId).join(","),
      },
      bundling,
    });
    signingSecret.grantRead(embedFn);
    embedFn.addToRolePolicy(invokeEmbeddingModel());
    embedFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: CHAT_MODELS.flatMap((m) => [
          `arn:${this.partition}:bedrock:${this.region}:${this.account}:inference-profile/${chatProfileId(m)}`,
          ...US_PROFILE_REGIONS.map(
            (r) => `arn:${this.partition}:bedrock:${r}::foundation-model/${m}`,
          ),
        ]),
      }),
    );

    // Public URL by design: every request must carry a valid HMAC, checked
    // before Bedrock is called. Unsigned calls cost a few ms of Lambda only.
    const embedUrl = embedFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new cloudwatch.Alarm(this, "EmbedErrors", {
      alarmDescription: "Embed Lambda errors (Bedrock failures or crashes)",
      metric: embedFn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new CfnOutput(this, "SupabaseSecretArn", { value: supabaseSecret.secretArn });
    new CfnOutput(this, "IngestFunctionName", { value: ingest.functionName });
    new CfnOutput(this, "EmbedUrl", { value: embedUrl.url });
    new CfnOutput(this, "EmbedSigningSecretArn", { value: signingSecret.secretArn });

    if (props.oidc) this.addOidcRoles(props.oidc, invokeEmbeddingModel);
  }

  private addOidcRoles(o: OidcProps, invokeEmbeddingModel: () => iam.PolicyStatement) {
    // Vercel → AWS: only this project's production and preview deployments.
    const vercelIssuer = `oidc.vercel.com/${o.vercelTeamSlug}`;
    const vercelProvider = new iam.OpenIdConnectProvider(this, "VercelOidc", {
      url: `https://${vercelIssuer}`,
      clientIds: [`https://vercel.com/${o.vercelTeamSlug}`],
    });
    const vercelRole = new iam.Role(this, "VercelQueryRole", {
      description: "Assumed by the Pikalo Vercel app to embed user questions",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(vercelProvider.openIdConnectProviderArn, {
        StringEquals: {
          [`${vercelIssuer}:aud`]: `https://vercel.com/${o.vercelTeamSlug}`,
        },
        StringLike: {
          [`${vercelIssuer}:sub`]: [
            `owner:${o.vercelTeamSlug}:project:${o.vercelProject}:environment:production`,
            `owner:${o.vercelTeamSlug}:project:${o.vercelProject}:environment:preview`,
          ],
        },
      }),
    });
    vercelRole.addToPolicy(invokeEmbeddingModel());

    // GitHub Actions → AWS for `cdk deploy` from main. It can assume the CDK
    // bootstrap roles, which are broad by design, so treat it as admin-level.
    const githubIssuer = "token.actions.githubusercontent.com";
    const githubProviderArn = o.createGithubOidcProvider
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
          [`${githubIssuer}:sub`]: `repo:${o.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*`],
      }),
    );

    new CfnOutput(this, "VercelRoleArn", { value: vercelRole.roleArn });
    new CfnOutput(this, "GithubDeployRoleArn", { value: deployRole.roleArn });
  }
}
