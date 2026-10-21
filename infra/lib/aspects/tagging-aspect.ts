import { IAspect, TagManager } from 'aws-cdk-lib';
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

/** La stessa priorità di default di Tags.of().add(): output dei tag invariato. */
const PRIORITA_TAG = 100;

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
    // I tag si scrivono direttamente nel TagManager del nodo, non con
    // Tags.of(node).add(): quella aggiunge un sub-aspect per ogni nodo, e da
    // aws-cdk-lib 2.172 il motore degli Aspect riparte da capo a ogni aggiunta,
    // con un tetto di 100 ripartenze («PossibleInfiniteLoopDetected»).
    // Questo aspect visita già ogni nodo, quindi il risultato è lo stesso.
    // Vanno gestite entrambe le interfacce: ITaggable (node.tags, incluso lo
    // Stack) e ITaggableV2 (node.cdkTagManager, risorse più recenti).
    // I nodi non taggabili si saltano: Tags.of() su di loro non aveva effetto.
    const gestore = TagManager.isTaggable(node)
      ? node.tags
      : TagManager.isTaggableV2(node)
        ? node.cdkTagManager
        : undefined;
    if (!gestore) {
      return;
    }

    // Apply IT standard tags according to specifications

    // Description: Descrizione dell'oggetto
    if (this.tags.description) {
      gestore.setTag('Description', this.tags.description, PRIORITA_TAG);
    }

    // Project: Progetto di riferimento
    gestore.setTag('Project', this.tags.project, PRIORITA_TAG);

    // Environment: Ambiente applicativo (PRD, STG, TST, DEV, etc.)
    const envCode = this.environmentCode || mapEnvironmentToCode(this.tags.environment);
    gestore.setTag('Environment', envCode, PRIORITA_TAG);

    // Name: Nome dell'oggetto (gestito principalmente da NamingAspect, 
    // ma può essere sovrascritto qui se specificato)
    if (this.tags.name) {
      gestore.setTag('Name', this.tags.name, PRIORITA_TAG);
    }

    // ManagedBy: Strumento di gestione (CF, TF, OT, Manual)
    // CDK genera CloudFormation, quindi usiamo 'CF'
    const managedBy = this.tags.managedBy === 'CDK' ? 'CF' : this.tags.managedBy;
    gestore.setTag('ManagedBy', managedBy, PRIORITA_TAG);

    // Owner: Gruppo o persona di riferimento
    gestore.setTag('Owner', this.tags.owner, PRIORITA_TAG);

    // Legacy tags for backward compatibility (if needed)
    if (this.tags.backup) {
      gestore.setTag('Backup', this.tags.backup, PRIORITA_TAG);
    }

    // Additional cost allocation tags
    if (this.projectCode) {
      gestore.setTag('ProjectCode', this.projectCode, PRIORITA_TAG);
    }

    // NB: rimosso il tag "CreatedDate" con new Date(): cambiava a ogni synth
    // rendendo il tagging non-deterministico (ogni deploy aggiornava i tag di
    // tutte le risorse). Se serve una data di creazione, passarla via props.
  }
}