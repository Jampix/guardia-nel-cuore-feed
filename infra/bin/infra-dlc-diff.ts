#!/usr/bin/env node
import 'source-map-support/register';
import * as fs from 'fs';
import {
  analyze,
  formatReport,
  fromChangeSet,
  fromCdkDiffText,
  ResourceChange,
} from '../tools/infra-dlc/diff-analyzer';

/**
 * Infra-DLC — CLI del controllo C2 (diff-analyzer).
 *
 * Uso:
 *   # via change set CloudFormation (consigliato, robusto)
 *   aws cloudformation describe-change-set --stack-name S --change-set-name C > cs.json
 *   npx ts-node bin/infra-dlc-diff.ts --changeset cs.json
 *
 *   # via testo di cdk diff (fallback)
 *   npx cdk diff MyStack 2>&1 | npx ts-node bin/infra-dlc-diff.ts --cdk-diff -
 *   npx ts-node bin/infra-dlc-diff.ts --cdk-diff diff.txt
 *
 * Flag:
 *   --warn-only   non fallisce (exit 0) anche con violazioni — per adozione graduale.
 *
 * Exit code: 0 = ok, 1 = violazioni (deploy da bloccare), 2 = errore d'uso.
 */

// Rimuove i codici colore ANSI che cdk diff può emettere.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, '');
}

function readInput(value: string): string {
  if (value === '-') {
    return fs.readFileSync(0, 'utf8'); // stdin
  }
  return fs.readFileSync(value, 'utf8');
}

function parseArgs(argv: string[]): {
  source?: 'changeset' | 'cdk-diff';
  path?: string;
  warnOnly: boolean;
} {
  let source: 'changeset' | 'cdk-diff' | undefined;
  let path: string | undefined;
  let warnOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--changeset') {
      source = 'changeset';
      path = argv[++i];
    } else if (a === '--cdk-diff') {
      source = 'cdk-diff';
      path = argv[++i];
    } else if (a === '--warn-only') {
      warnOnly = true;
    }
  }
  return { source, path, warnOnly };
}

function main(): void {
  const { source, path, warnOnly } = parseArgs(process.argv.slice(2));

  if (!source || !path) {
    console.error(
      'Uso: infra-dlc-diff (--changeset <file> | --cdk-diff <file|->) [--warn-only]',
    );
    process.exit(2);
  }

  let changes: ResourceChange[];
  try {
    const raw = readInput(path);
    if (source === 'changeset') {
      changes = fromChangeSet(JSON.parse(raw));
    } else {
      changes = fromCdkDiffText(stripAnsi(raw));
    }
  } catch (err) {
    console.error(`💥 Impossibile leggere/parsare l'input: ${(err as Error).message}`);
    process.exit(2);
  }

  const report = analyze(changes);
  console.log(formatReport(report));

  if (!report.ok && !warnOnly) {
    process.exit(1);
  }
  process.exit(0);
}

main();
