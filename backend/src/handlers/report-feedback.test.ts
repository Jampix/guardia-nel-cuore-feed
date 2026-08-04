import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { handler } from './report-feedback';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);

const cittadino = { sub: 'user-1', 'cognito:groups': 'cittadino' };

function segnala(motivo?: string) {
  return handler(apiEvent({
    method: 'POST',
    claims: cittadino,
    pathParameters: { id: 'f1' },
    body: motivo === undefined ? {} : { motivo },
  }));
}

/** L'avviso allo staff, o `undefined` se non è partito. */
function avviso() {
  const call = ses.commandCalls(SendEmailCommand)[0];
  if (!call) return undefined;
  const s = call.args[0].input.Content?.Simple;
  return {
    a: call.args[0].input.Destination?.ToAddresses?.[0] ?? '',
    oggetto: s?.Subject?.Data ?? '',
    testo: s?.Body?.Text?.Data ?? '',
  };
}

beforeEach(() => {
  ddb.reset(); ses.reset();
  ses.on(SendEmailCommand).resolves({});
  ddb.on(TransactWriteCommand).resolves({});
  ddb.on(GetCommand).resolves({ Item: { id: 'f1', titolo: 'Pista ciclabile', segnalazioni: 2 } });
});

describe('report-feedback', () => {
  it('401 se non autenticato', async () => {
    const { status } = parseResult(await handler(apiEvent({
      method: 'POST', claims: {}, pathParameters: { id: 'f1' },
    })));
    expect(status).toBe(401);
    expect(ddb.commandCalls(TransactWriteCommand).length).toBe(0);
  });

  it('registra la segnalazione e incrementa il contatore in una transazione', async () => {
    const { status } = parseResult(await segnala('Contenuto offensivo'));

    expect(status).toBe(200);
    const items = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems ?? [];
    expect(items.length).toBe(2);
    // Una sola segnalazione per utente: la chiave contiene il suo id.
    expect(items[0].Put?.Item?.sk).toBe('REPORT#user-1');
    expect(items[0].Put?.ConditionExpression).toContain('attribute_not_exists');
    expect(items[1].Update?.UpdateExpression).toContain('ADD segnalazioni');
  });

  it('avvisa lo staff con titolo, motivo, totale e link', async () => {
    // Prima una segnalazione si notava solo aprendo il backoffice.
    await segnala('Contenuto offensivo o discriminatorio');

    const mail = avviso();
    expect(mail?.a).toBe('staff@example.com');
    expect(mail?.oggetto).toContain('Pista ciclabile');
    expect(mail?.testo).toContain('Contenuto offensivo');
    expect(mail?.testo).toContain('Segnalazioni totali: 2');
    expect(mail?.testo).toContain('/feedback/f1');
  });

  it('dice esplicitamente se il motivo non è stato indicato', async () => {
    await segnala();

    expect(avviso()?.testo).toContain('Nessun motivo indicato');
  });

  it('NON riavvisa se lo stesso utente segnala di nuovo', async () => {
    // Idempotente: premere due volte non deve moltiplicare le email allo staff.
    const err: any = new Error('cancelled');
    err.name = 'TransactionCanceledException';
    ddb.on(TransactWriteCommand).rejects(err);

    const { status, body } = parseResult(await segnala('di nuovo'));

    expect(status).toBe(200);
    expect(body.reported).toBe(true);
    expect(avviso()).toBeUndefined();
  });

  it('un errore di invio non fa fallire la segnalazione', async () => {
    ses.on(SendEmailCommand).rejects(new Error('SES giù'));

    const { status } = parseResult(await segnala('offensivo'));

    expect(status).toBe(200);
  });
});
