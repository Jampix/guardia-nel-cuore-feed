import { IAspect, Tags } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

export interface TaggingAspectProps {
  tags: {
    description?: string;
    project: string;
    environment: string;
    name?: string;
    managedBy: string;
    owner: string;
    backup?: string;
  };
  projectCode?: string;
  environmentCode?: string; // Codice ambiente standardizzato (PRD, STG, TST, DEV)
}

/**
 * Maps internal environment names to IT standard codes
 * - dev -> DEV (development)
 * - staging -> STG (staging)
 * - prod -> PRD (production)
 * - test -> TST (test)
 * 
 * Other environments can be added as needed (UAT, PPR, etc.)
 */
export function mapEnvironmentToCode(environment: string): string {
  const envMap: Record<string, string> = {
    'dev': 'DEV',
    'development': 'DEV',
    'staging': 'STG',
    'prod': 'PRD',
    'production': 'PRD',
    'test': 'TST',
    'uat': 'UAT',
    'ppr': 'PPR'
  };

  const normalized = environment.toLowerCase();
  return envMap[normalized] || environment.toUpperCase();
}

export class TaggingAspect implements IAspect {
  private readonly tags: TaggingAspectProps['tags'];
  private readonly projectCode?: string;
  private readonly environmentCode?: string;

  constructor(props: TaggingAspectProps) {
    this.tags = props.tags;
    this.projectCode = props.projectCode;
    this.environmentCode = props.environmentCode;
  }

  visit(node: IConstruct): void {
    // Apply IT standard tags according to specifications
    
    // Description: Descrizione dell'oggetto
    if (this.tags.description) {
      Tags.of(node).add('Description', this.tags.description);
    }

    // Project: Progetto di riferimento
    Tags.of(node).add('Project', this.tags.project);

    // Environment: Ambiente applicativo (PRD, STG, TST, DEV, etc.)
    const envCode = this.environmentCode || mapEnvironmentToCode(this.tags.environment);
    Tags.of(node).add('Environment', envCode);

    // Name: Nome dell'oggetto (gestito principalmente da NamingAspect, 
    // ma può essere sovrascritto qui se specificato)
    if (this.tags.name) {
      Tags.of(node).add('Name', this.tags.name);
    }

    // ManagedBy: Strumento di gestione (CF, TF, OT, Manual)
    // CDK genera CloudFormation, quindi usiamo 'CF'
    const managedBy = this.tags.managedBy === 'CDK' ? 'CF' : this.tags.managedBy;
    Tags.of(node).add('ManagedBy', managedBy);

    // Owner: Gruppo o persona di riferimento
    Tags.of(node).add('Owner', this.tags.owner);

    // Legacy tags for backward compatibility (if needed)
    if (this.tags.backup) {
      Tags.of(node).add('Backup', this.tags.backup);
    }

    // Additional cost allocation tags
    if (this.projectCode) {
      Tags.of(node).add('ProjectCode', this.projectCode);
    }

    // NB: rimosso il tag "CreatedDate" con new Date(): cambiava a ogni synth
    // rendendo il tagging non-deterministico (ogni deploy aggiornava i tag di
    // tutte le risorse). Se serve una data di creazione, passarla via props.
  }
}