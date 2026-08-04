import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { handler } from './feedback-owner';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const ses = mockClient(SESv2Client);

const autore = { sub: 'user-1' };
const altro = { sub: 'user-2' };

const PRIVATA = {
  id: 'f1',
  titolo: 'Panchine al parco',
  autoreId: 'user-1',
  visibilita: 'privato',
  numeroVoti: 0,
  segnalazioni: 0,
};

function avviso() {
  const call = ses.commandCalls(SendEmailCommand)[0];
  if (!call) return undefined;
  const s = call.args[0].input.Content?.Simple;
  return { oggetto: s?.Subject?.Data ?? '', testo: s?.Body?.Text?.Data ?? '' };
}

beforeEach(() => {
  ddb.reset(); s3.reset(); ses.reset();
  ses.on(SendEmailCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(DeleteCommand).resolves({});
  ddb.on(UpdateCommand).resolves({ Attributes: { id: 'f1' } });
});

describe('feedback-owner', () => {
  it('403 se non sei l\'autore', async () => {
    ddb.on(GetCommand).resolves({ Item: PRIVATA });
    const { status } = parseResult(await handler(apiEvent({
      method: 'DELETE', claims: altro, pathParameters: { id: 'f1' },
    })));
    expect(status).toBe(403);
    expect(ddb.commandCalls(DeleteCommand).length).toBe(0);
  });

  describe('modifica', () => {
    it('consentita finché la proposta è privata', async () => {
      ddb.on(GetCommand).resolves({ Item: PRIVATA });
      const { status } = parseResult(await handler(apiEvent({
        method: 'PATCH', claims: autore, pathParameters: { id: 'f1' }, body: { titolo: 'Nuovo titolo' },
      })));
      expect(status).toBe(200);
    });

    it('bloccata dopo la pubblicazione, senza suggerire di eliminare', async () => {
      // Il messaggio precedente diceva "Puoi eliminarla": era un invito
      // all'azione distruttiva proprio quando la proposta ha già voti.
      ddb.on(GetCommand).resolves({ Item: { ...PRIVATA, visibilita: 'pubblico' } });
      const { status, body } = parseResult(await handler(apiEvent({
        method: 'PATCH', claims: autore, pathParameters: { id: 'f1' }, body: { titolo: 'Cambio' },
      })));

      expect(status).toBe(409);
      expect(body.message).not.toContain('eliminarla');
      expect(body.message).toContain('staff');
      expect(ddb.commandCalls(UpdateCommand).length).toBe(0);
    });
  });

  describe('eliminazione', () => {
    it('non disturba lo staff per una proposta privata e non segnalata', async () => {
      ddb.on(GetCommand).resolves({ Item: PRIVATA });
      const { status } = parseResult(await handler(apiEvent({
        method: 'DELETE', claims: autore, pathParameters: { id: 'f1' },
      })));

      expect(status).toBe(200);
      expect(avviso()).toBeUndefined();
    });

    it('avvisa lo staff se la proposta era pubblicata', async () => {
      // Con la pubblicazione altri cittadini l'hanno letta e votata: la loro
      // partecipazione spariva senza che nessuno lo sapesse.
      ddb.on(GetCommand).resolves({ Item: { ...PRIVATA, visibilita: 'pubblico', numeroVoti: 7 } });
      await handler(apiEvent({ method: 'DELETE', claims: autore, pathParameters: { id: 'f1' } }));

      const mail = avviso();
      expect(mail?.oggetto).toContain('Panchine al parco');
      expect(mail?.testo).toContain('PUBBLICATA');
      expect(mail?.testo).toContain('Sostegni ricevuti: 7');
    });

    it('avvisa lo staff se la proposta era segnalata, anche se privata', async () => {
      // È la via di fuga dalla moderazione: eliminando sparivano proposta E
      // segnalazioni, senza lasciare traccia.
      ddb.on(GetCommand).resolves({ Item: { ...PRIVATA, segnalazioni: 2 } });
      await handler(apiEvent({ method: 'DELETE', claims: autore, pathParameters: { id: 'f1' } }));

      const mail = avviso();
      expect(mail?.testo).toContain('Segnalazioni aperte: 2');
      expect(mail?.testo).toContain('unica traccia rimasta');
    });

    it('avvisa PRIMA di cancellare, altrimenti i dati non ci sarebbero più', async () => {
      ddb.on(GetCommand).resolves({ Item: { ...PRIVATA, visibilita: 'pubblico' } });
      await handler(apiEvent({ method: 'DELETE', claims: autore, pathParameters: { id: 'f1' } }));

      expect(ses.commandCalls(SendEmailCommand).length).toBe(1);
      expect(ddb.commandCalls(DeleteCommand).length).toBeGreaterThan(0);
    });

    it('un errore di invio non impedisce l\'eliminazione', async () => {
      ddb.on(GetCommand).resolves({ Item: { ...PRIVATA, visibilita: 'pubblico' } });
      ses.on(SendEmailCommand).rejects(new Error('SES giù'));

      const { status } = parseResult(await handler(apiEvent({
        method: 'DELETE', claims: autore, pathParameters: { id: 'f1' },
      })));

      expect(status).toBe(200);
    });
  });
});
