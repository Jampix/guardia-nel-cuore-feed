#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { loadConfig } from '../lib/config';
import { InfrastructureApp } from '../lib/app';

async function main(): Promise<void> {
  const environment = process.env.ENVIRONMENT ?? 'prod';
  const config = await loadConfig(environment);

  const app = new cdk.App();
  const infra = new InfrastructureApp(app, config);
  infra.printSummary();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
