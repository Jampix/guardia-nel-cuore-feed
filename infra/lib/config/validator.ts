import { ProjectConfig } from './interfaces';

/**
 * Result of configuration validation.
 */
export interface ValidationResult {
  /** Array of validation errors (must be empty for valid config) */
  errors: string[];
  /** Array of validation warnings (optimization suggestions) */
  warnings: string[];
  /** True if configuration is valid (no errors) */
  isValid: boolean;
}

/**
 * Validatore della configurazione di progetto (serverless).
 *
 * Valida identità progetto, account, region, tag e feature flag prima del
 * deploy. Le validazioni EC2/VPC/compute/storage del template originale sono
 * state rimosse insieme agli stack corrispondenti.
 *
 * @example
 * ```typescript
 * const result = ConfigValidator.validate(config);
 * if (!result.isValid) {
 *   console.error('Validation failed:', result.errors);
 *   process.exit(1);
 * }
 * ```
 */
export class ConfigValidator {
  private static readonly AWS_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-south-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
    'sa-east-1', 'ca-central-1'
  ];

  /**
   * Valida la configurazione di progetto.
   *
   * @param config - La configurazione da validare
   * @returns Risultato con errori e warning
   */
  static validate(config: ProjectConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    this.validateAccountId(config.account, errors);
    this.validateRegion(config.region, errors);
    this.validateProjectCode(config.projectCode, errors);
    this.validateProjectName(config.projectName, errors);
    this.validateTags(config.tags, errors, warnings);
    this.validateFeaturesConfig(config.features, warnings);

    return {
      errors,
      warnings,
      isValid: errors.length === 0
    };
  }

  private static validateAccountId(account: string, errors: string[]): void {
    if (!account || account === 'YOUR_PROD_ACCOUNT_ID') {
      errors.push('❌ Account ID non configurato. Aggiorna lib/config/accounts.ts');
      return;
    }

    if (!/^\d{12}$/.test(account)) {
      errors.push('❌ Account ID deve essere di 12 cifre numeriche');
    }
  }

  private static validateRegion(region: string, errors: string[]): void {
    if (!region) {
      errors.push('❌ Region non specificata');
      return;
    }

    if (!this.AWS_REGIONS.includes(region)) {
      errors.push(`❌ Region "${region}" non valida. Regioni supportate: ${this.AWS_REGIONS.join(', ')}`);
    }
  }

  private static validateProjectCode(code: string, errors: string[]): void {
    if (!code || code === 'PROJ') {
      errors.push('❌ Project code non configurato. Aggiorna lib/config/common.ts');
      return;
    }

    if (!/^[A-Z]{2,4}$/.test(code)) {
      errors.push('❌ Project code deve essere 2-4 caratteri maiuscoli (es: GNC, ABC)');
    }
  }

  private static validateProjectName(name: string, errors: string[]): void {
    if (!name || name === 'PROJECT_NAME') {
      errors.push('❌ Project name non configurato. Aggiorna lib/config/common.ts');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      errors.push('❌ Project name deve contenere solo lettere minuscole, numeri e trattini');
    }
  }

  private static validateTags(tags: ProjectConfig['tags'], errors: string[], warnings: string[]): void {
    if (!tags.owner || tags.owner === 'TEAM_NAME') {
      errors.push('❌ Tag Owner non configurato. Aggiorna lib/config/common.ts');
    }

    const validManagedBy = ['CF', 'TF', 'OT', 'Manual', 'CDK'];
    if (!tags.managedBy || !validManagedBy.includes(tags.managedBy)) {
      errors.push(`❌ Tag ManagedBy deve essere uno di: ${validManagedBy.join(', ')}`);
    }

    if (!tags.project || tags.project === 'PROJECT_NAME') {
      errors.push('❌ Tag Project non configurato correttamente');
    }

    const validEnvironments = ['dev', 'development', 'staging', 'prod', 'production', 'test', 'uat', 'ppr'];
    const normalizedEnv = tags.environment.toLowerCase();
    if (!validEnvironments.includes(normalizedEnv)) {
      warnings.push(`⚠️  Environment "${tags.environment}" non standard. Verifica il mapping in tagging-aspect.ts`);
    }
  }

  private static validateFeaturesConfig(features: ProjectConfig['features'], warnings: string[]): void {
    if (features.dns?.enabled && (!features.dns.domain || features.dns.domain === 'PROJECT_DOMAIN')) {
      warnings.push('⚠️  DNS abilitato ma domain non configurato correttamente');
    }
  }

  /**
   * Stampa i risultati della validazione in console.
   */
  static printValidationResult(result: ValidationResult): void {
    if (result.errors.length > 0) {
      console.error('\n❌ ERRORI DI CONFIGURAZIONE:');
      result.errors.forEach(error => console.error(`  ${error}`));
      console.error('\n💡 Correggi gli errori prima di procedere con il deploy.\n');
    }

    if (result.warnings.length > 0) {
      console.warn('\n⚠️  AVVISI DI CONFIGURAZIONE:');
      result.warnings.forEach(warning => console.warn(`  ${warning}`));
      console.warn('\n💡 Considera questi avvisi per ottimizzare la configurazione.\n');
    }

    if (result.isValid && result.warnings.length === 0) {
      console.log('✅ Configurazione valida e ottimizzata!');
    }
  }
}
