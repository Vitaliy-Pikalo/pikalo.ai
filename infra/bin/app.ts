import { App } from "aws-cdk-lib";
import { PikaloStack } from "../lib/pikalo-stack.ts";

const app = new App();
const ctx = (key: string) => app.node.tryGetContext(key);

new PikaloStack(app, "Pikalo", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  description: "Pikalo IRS ingestion pipeline and OIDC roles",
  vercelTeamSlug: ctx("vercelTeamSlug"),
  vercelProject: ctx("vercelProject"),
  githubRepo: ctx("githubRepo"),
  createGithubOidcProvider: ctx("createGithubOidcProvider") !== false,
});
