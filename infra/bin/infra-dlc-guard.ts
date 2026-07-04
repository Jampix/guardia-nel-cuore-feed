#!/usr/bin/env node
import 'source-map-support/register';
import { spawnSync } from 'child_process';
import { analyze, formatReport, fromChangeSet, ChangeSetDescription } from '../tools/infra-dlc/diff-analyzer';

/**
 * Infra-DLC — Guard pre-deploy (integrazione automatica del controllo C2).
 *
 * Orchestra il loop: synth → change set → analyze → verdetto.
 *   1. `cdk deploy --no-execute` crea un change set REALE contro lo stack deployato
 *      (gestisce asset, parametri e bootstrap che un `create-change-set` manuale sbaglierebbe).
 *   2. `aws cloudformation describe-change-set` → output JSON strutturato.
 *   3. Riusa il core di `tools/infra-dlc/diff-analyzer` per bloccare REPLACE/DESTROY
 *      su risorse stateful / immutable-name.
 *   4. Pulisce il change set (salvo --keep-change-set).
 *
 * Uso:
 *   npm run infra-dlc:guard -- <StackName> [--profile P] [--env dev|staging|prod]
 *                                          [--execute-if-clean] [--warn-only] [--keep-change-set]
 *
 * Exit: 0 = ok (e, con --execute-if-clean, deploy eseguito); 1 = violazioni; 2 = errore.
 *
 * NB: richiede AWS CLI + credenziali + account bootstrappato. Non è testabile offline.
 */

interface Args {
  stack?: string;
  profile?: string;
  env?: string;
  executeIfClean: boolean;
  warnOnly: boolean;
  keepChangeSet: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { executeIfClean: false, warnOnly: false, keepChangeSet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') {
      args.profile = argv[++i];
    } else if (a === '--env') {
      args.env = argv[++i];
    } else if (a === '--execute-if-clean') {
      args.executeIfClean = true;
    } else if (a === '--warn-only') {
      args.warnOnly = true;
    } else if (a === '--keep-change-set') {
      args.keepChangeSet = true;
    } else if (!a.startsWith('--') && !args.stack) {
      args.stack = a;
    }
  }
  return args;
}

function die(msg: string, code = 2): never {
  console.error(msg);
  process.exit(code);
}

/** Esegue aws CLI catturando stdout JSON. */
function aws(awsArgs: string[], profile?: string): { status: number; stdout: string; stderr: string } {
  const full = profile ? [...awsArgs, '--profile', profile] : awsArgs;
  const r = spawnSync('aws', full, { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function deleteChangeSet(stack: string, csName: string, profile?: string): void {
  aws(['cloudformation', 'delete-change-set', '--stack-name', stack, '--change-set-name', csName], profile);
}

const NO_CHANGES = /didn't contain changes|No updates are to be performed|The submitted information/i;

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.stack) {
    die('Uso: infra-dlc-guard <StackName> [--profile P] [--env E] [--execute-if-clean] [--warn-only] [--keep-change-set]');
  }
  const stack = args.stack;
  const csName = `infra-dlc-${stack.replace(/[^A-Za-z0-9-]/g, '-')}-${process.pid}`;

  // 1. cdk deploy --no-execute → crea il change set (stdio ereditato: l'utente vede il progresso)
  console.log(`\n▶ [1/3] Creazione change set per ${stack} (cdk deploy --no-execute)...`);
  const cdkArgs = ['cdk', 'deploy', stack, '--no-execute', '--require-approval', 'never', '--change-set-name', csName];
  if (args.profile) {
    cdkArgs.push('--profile', args.profile);
  }
  const cdkEnv = { ...process.env, ...(args.env ? { ENVIRONMENT: args.env } : {}) };
  const cdk = spawnSync('npx', cdkArgs, { stdio: 'inherit', env: cdkEnv });
  if ((cdk.status ?? 1) !== 0) {
    die(`💥 cdk deploy --no-execute è fallito (synth/auth/bootstrap?). Vedi output sopra.`);
  }

  // 2. describe-change-set
  console.log(`\n▶ [2/3] Lettura del change set...`);
  const desc = aws(
    ['cloudformation', 'describe-change-set', '--stack-name', stack, '--change-set-name', csName, '--output', 'json'],
    args.profile,
  );

  if (desc.status !== 0) {
    // change set non creato = nessun cambiamento (cdk lo rimuove da solo)
    if (/ChangeSetNotFound|does not exist/i.test(desc.stderr)) {
      console.log('✅ Nessun cambiamento da deployare. Niente da analizzare.');
      process.exit(0);
    }
    die(`💥 describe-change-set fallito: ${desc.stderr.trim()}`);
  }

  let parsed: ChangeSetDescription;
  try {
    parsed = JSON.parse(desc.stdout);
  } catch (e) {
    die(`💥 Output describe-change-set non parsabile: ${(e as Error).message}`);
  }

  if (parsed.Status === 'FAILED' && NO_CHANGES.test(parsed.StatusReason ?? '')) {
    console.log('✅ Nessun cambiamento da deployare.');
    if (!args.keepChangeSet) {
      deleteChangeSet(stack, csName, args.profile);
    }
    process.exit(0);
  }

  // 3. analyze (riusa il core C2)
  console.log(`\n▶ [3/3] Analisi C2 (REPLACE/DESTROY su stateful/immutable-name)...\n`);
  const report = analyze(fromChangeSet(parsed));
  console.log(formatReport(report));

  if (!report.ok) {
    if (!args.keepChangeSet) {
      deleteChangeSet(stack, csName, args.profile);
    }
    process.exit(args.warnOnly ? 0 : 1);
  }

  // pulito → opzionalmente esegui il change set (deploy guidato)
  if (args.executeIfClean) {
    console.log(`\n▶ Verdetto pulito → esecuzione change set...`);
    const exec = aws(['cloudformation', 'execute-change-set', '--stack-name', stack, '--change-set-name', csName], args.profile);
    if (exec.status !== 0) {
      die(`💥 execute-change-set fallito: ${exec.stderr.trim()}`);
    }
    console.log('⏳ Change set in esecuzione. Monitora con: aws cloudformation describe-stacks --stack-name ' + stack);
    process.exit(0);
  }

  if (!args.keepChangeSet) {
    deleteChangeSet(stack, csName, args.profile);
  }
  console.log('\nℹ️  Verdetto pulito. Procedi col deploy normale, oppure rilancia con --execute-if-clean.');
  process.exit(0);
}

if (require.main === module) {
  main();
}
