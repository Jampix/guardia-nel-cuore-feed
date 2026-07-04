#!/usr/bin/env node
import 'source-map-support/register';
import { loadConfig, ConfigValidator } from '../lib/config';

async function main(): Promise<void> {
  const environment = process.env.ENVIRONMENT ?? 'prod';
  console.log(`🔍 Validating configuration for ${environment.toUpperCase()} environment...\n`);

  const config = await loadConfig(environment);

  console.log('📋 Configuration Summary:');
  console.log(`  Project:       ${config.projectName} (${config.projectCode})`);
  console.log(`  Environment:   ${config.environment}`);
  console.log(`  Account:       ${config.account}`);
  console.log(`  Region:        ${config.region}\n`);

  const validation = ConfigValidator.validate(config);
  ConfigValidator.printValidationResult(validation);

  if (validation.isValid) {
    console.log('🎉 Configuration is ready for deployment!');
    process.exit(0);
  }
  console.log('❌ Please fix configuration errors before deploying.');
  process.exit(1);
}

main().catch((error) => {
  console.error('💥 Error during validation:', error);
  process.exit(1);
});
