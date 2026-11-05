import { beforeAll, describe, expect, it } from "vitest";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { EMBEDDING_MODEL_ID, PikaloStack } from "../lib/pikalo-stack";

let t: Template; // default: no OIDC (what the real account deploys)
let withOidc: Template;

const env = { account: "123456789012", region: "us-east-1" };

beforeAll(() => {
  t = Template.fromStack(new PikaloStack(new App(), "Test", { env }));
  withOidc = Template.fromStack(
    new PikaloStack(new App(), "TestOidc", {
      env,
      oidc: {
        vercelTeamSlug: "team-x",
        vercelProject: "pikalo",
        githubRepo: "owner/repo",
        createGithubOidcProvider: true,
      },
    }),
  );
});

const MODEL_ARN = `arn:aws:bedrock:us-east-1::foundation-model/${EMBEDDING_MODEL_ID}`;

describe("raw page archive", () => {
  it("is private, encrypted, versioned and retained", () => {
    t.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
      Properties: {
        VersioningConfiguration: { Status: "Enabled" },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        BucketEncryption: Match.objectLike({}),
      },
    });
  });

  it("denies non-TLS access", () => {
    t.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Deny",
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          }),
        ]),
      },
    });
  });
});

describe("ingest Lambda", () => {
  it("runs on Node 22 arm64 without reserved concurrency", () => {
    // matches the ingest function (15 min timeout)
    t.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      Timeout: 900,
      ReservedConcurrentExecutions: Match.absent(),
      Environment: {
        Variables: Match.objectLike({ BEDROCK_MODEL_ID: EMBEDDING_MODEL_ID }),
      },
    });
  });

  it("is scheduled weekly", () => {
    t.hasResourceProperties("AWS::Events::Rule", {
      ScheduleExpression: "cron(0 9 ? * MON *)",
    });
  });

  it("alarms on errors", () => {
    t.hasResourceProperties("AWS::CloudWatch::Alarm", {
      MetricName: "Errors",
      Threshold: 1,
    });
  });
});

describe("archive permissions", () => {
  it("never lets the Lambda delete archived pages", () => {
    const actions = JSON.stringify(t.findResources("AWS::IAM::Policy"));
    expect(actions).not.toMatch(/s3:DeleteObject/);
    expect(actions).toMatch(/s3:PutObject/);
  });

  it("seeds the secret as JSON so the Lambda fails with a clear message", () => {
    t.hasResourceProperties("AWS::SecretsManager::Secret", {
      GenerateSecretString: {
        SecretStringTemplate: "{}",
        GenerateStringKey: "placeholder",
      },
    });
  });
});

describe("least-privilege Bedrock access", () => {
  it("only ever allows InvokeModel on the Titan embedding model", () => {
    const policies = t.findResources("AWS::IAM::Policy");
    const bedrockStatements = Object.values(policies).flatMap((p) =>
      (
        p.Properties.PolicyDocument.Statement as {
          Action: string | string[];
          Resource: unknown;
        }[]
      ).filter((s) => [s.Action].flat().some((a) => a.startsWith("bedrock:"))),
    );
    expect(bedrockStatements.length).toBe(2); // ingest + embed Lambdas
    for (const s of bedrockStatements) {
      expect(s.Action).toBe("bedrock:InvokeModel");
      expect(JSON.stringify(s.Resource)).toContain(EMBEDDING_MODEL_ID);
      expect(JSON.stringify(s.Resource)).not.toContain("*");
    }
    expect(MODEL_ARN).toContain("titan-embed-text-v2");
  });
});

describe("OIDC roles", () => {
  it("Vercel role trusts only the pikalo project's production and preview", () => {
    withOidc.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: { "oidc.vercel.com/team-x:aud": "https://vercel.com/team-x" },
              StringLike: {
                "oidc.vercel.com/team-x:sub": [
                  "owner:team-x:project:pikalo:environment:production",
                  "owner:team-x:project:pikalo:environment:preview",
                ],
              },
            },
          }),
        ],
      },
    });
  });

  it("GitHub role trusts only main of this repo", () => {
    withOidc.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub":
                  "repo:owner/repo:ref:refs/heads/main",
              },
            },
          }),
        ],
      },
    });
  });

  it("creates no IAM users or access keys in either mode", () => {
    for (const x of [t, withOidc]) {
      x.resourceCountIs("AWS::IAM::User", 0);
      x.resourceCountIs("AWS::IAM::AccessKey", 0);
    }
  });

  it("creates no OIDC providers by default (blocked by the account's org policy)", () => {
    t.resourceCountIs("Custom::AWSCDKOpenIdConnectProvider", 0);
    withOidc.resourceCountIs("Custom::AWSCDKOpenIdConnectProvider", 2);
  });
});

describe("signed embed service", () => {
  it("exposes the embed Lambda through a function URL", () => {
    t.hasResourceProperties("AWS::Lambda::Url", { AuthType: "NONE" });
    t.hasResourceProperties("AWS::Lambda::Function", {
      Timeout: 10,
      Environment: {
        Variables: Match.objectLike({ SIGNING_SECRET_ARN: Match.anyValue() }),
      },
    });
  });

  it("generates a long random signing secret", () => {
    t.hasResourceProperties("AWS::SecretsManager::Secret", {
      GenerateSecretString: { PasswordLength: 64, ExcludePunctuation: true },
    });
  });

  it("outputs what the Vercel app needs", () => {
    t.hasOutput("EmbedUrl", {});
    t.hasOutput("EmbedSigningSecretArn", {});
  });
});
