import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { handler } from './admin-categories';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);

const staff = { sub: 'a-1', 'cognito:groups': 'admin' };
const membro = { sub: 'm-1', 'cognito:groups': 'membro' };
const cittadino = { sub: 'u-1', 'cognito:groups': 'cittadino' };

/** CRUD categorie: un solo handler per quattro metodi, quindi il controllo del
 *  ruolo va verificato su OGNI metodo, non solo sulla lettura. */
function call(method: string, opts: Record<string, unknown> = {}) {
  return handler(apiEvent({ method, claims: staff, ...opts } as any));
}

beforeEach(() => {
  ddb.reset();
  ddb.on(ScanCommand).resolves({ Items: [] });
  ddb.on(PutCommand).resolves({});
  ddb.on(UpdateCommand).resolves({ Attributes: { id: 'c1', nome: 'Nuovo' } });
  ddb.on(DeleteCommand).resolves({});
});

describe('admin-categories', () => {
  describe('accesso riservato allo staff', () => {
    it('403 al cittadino su TUTTI i metodi', async () => {
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        const { status } = parseResult(await handler(apiEvent({
          method, claims: cittadino, pathParameters: { id: 'c1' }, body: { nome: 'X' },
        })));
        expect(status, method).toBe(403);
      }
      expect(ddb.commandCalls(PutCommand).length).toBe(0);
      expect(ddb.commandCalls(DeleteCommand).length).toBe(0);
    });

    it('consentito anche al gruppo `membro`', async () => {
      const { status } = parseResult(await handler(apiEvent({ method: 'GET', claims: membro })));
      expect(status).toBe(200);
    });
  });

  describe('creazione', () => {
    it('crea una categoria attiva con id generato dal server', async () => {
      const { status, body } = parseResult(await call('POST', { body: { nome: 'Illuminazione' } }));

      expect(status).toBe(201);
      expect(body.nome).toBe('Illuminazione');
      expect(body.attiva).toBe(true);
      expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('rifiuta un nome vuoto o di soli spazi', async () => {
      for (const nome of ['', '   ', undefined]) {
        const { status } = parseResult(await call('POST', { body: { nome } }));
        expect(status, JSON.stringify(nome)).toBe(400);
      }
      expect(ddb.commandCalls(PutCommand).length).toBe(0);
    });

    it('taglia i nomi troppo lunghi invece di rifiutarli', async () => {
      const { body } = parseResult(await call('POST', { body: { nome: 'x'.repeat(200) } }));
      expect(body.nome.length).toBe(60);
    });
  });

  describe('modifica', () => {
    it('rinomina', async () => {
      const { status } = parseResult(await call('PATCH', {
        pathParameters: { id: 'c1' }, body: { nome: 'Rinominata' },
      }));

      expect(status).toBe(200);
      const input = ddb.commandCalls(UpdateCommand)[0].args[0].input;
      expect(input.UpdateExpression).toContain('#nome');
      expect(input.ExpressionAttributeValues?.[':nome']).toBe('Rinominata');
    });

    it('attiva e disattiva', async () => {
      await call('PATCH', { pathParameters: { id: 'c1' }, body: { attiva: false } });
      expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues?.[':attiva'])
        .toBe(false);
    });

    it('rifiuta il nome vuoto in modifica', async () => {
      const { status } = parseResult(await call('PATCH', {
        pathParameters: { id: 'c1' }, body: { nome: '  ' },
      }));
      expect(status).toBe(400);
      expect(ddb.commandCalls(UpdateCommand).length).toBe(0);
    });

    it('400 se non c\'è niente da aggiornare', async () => {
      const { status } = parseResult(await call('PATCH', { pathParameters: { id: 'c1' }, body: {} }));
      expect(status).toBe(400);
    });

    it('400 senza id', async () => {
      const { status } = parseResult(await call('PATCH', { body: { nome: 'X' } }));
      expect(status).toBe(400);
    });
  });

  describe('eliminazione', () => {
    it('elimina per id', async () => {
      await call('DELETE', { pathParameters: { id: 'c1' } });
      expect(ddb.commandCalls(DeleteCommand)[0].args[0].input.Key).toEqual({ id: 'c1' });
    });
  });
});
