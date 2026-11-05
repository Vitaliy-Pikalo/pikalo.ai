import { App } from "aws-cdk-lib";
import { PikaloStack } from "../lib/pikalo-stack.ts";

const app = new App();
const ctx = (key: string) => app.node.tryGetContext(key);

new PikaloStack(app, "Pikalo", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: ctx("region") ?? "us-east-2" },
  description: "Pikalo IRS ingestion pipeline and OIDC roles",
  vercelTeamSlug: ctx("vercelTeamSlug"),
  vercelProject: ctx("vercelProject"),
  githubRepo: ctx("githubRepo"),
  // `-c key=false` arrives as the string "false".
  createGithubOidcProvider: String(ctx("createGithubOidcProvider")) !== "false",
});
