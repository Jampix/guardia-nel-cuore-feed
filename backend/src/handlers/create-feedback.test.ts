import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './create-feedback';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const citizen = { sub: 'user-1', nickname: 'Marco P.' };

beforeEach(() => {
  ddb.reset();
  ddb.on(PutCommand).resolves({});
});

describe('create-feedback', () => {
  it('rifiuta senza autenticazione (401)', async () => {
    const { status } = parseResult(await handler(apiEvent({ claims: {}, body: { titolo: 'x', descrizione: 'yyyyyyyyyy' } })));
    expect(status).toBe(401);
  });

  it('richiede titolo e descrizione (400)', async () => {
    const { status } = parseResult(await handler(apiEvent({ claims: citizen, body: { titolo: 'Solo titolo' } })));
    expect(status).toBe(400);
  });

  it('rifiuta un titolo troppo lungo (400)', async () => {
    const { status } = parseResult(await handler(apiEvent({
      claims: citizen, body: { titolo: 'a'.repeat(121), descrizione: 'descrizione valida' },
    })));
    expect(status).toBe(400);
  });

  it('crea SEMPRE privata, anche se il client chiede pubblico', async () => {
    const { status, body } = parseResult(await handler(apiEvent({
      claims: citizen,
      body: { titolo: 'Buche in via Roma', descrizione: 'Strada pericolosa', visibilita: 'pubblico' },
    })));
    expect(status).toBe(201);
    expect(body.visibilita).toBe('privato');
    expect(body.stato).toBe('proposta');
    expect(body.autoreId).toBe('user-1');
    expect(body.autoreNick).toBe('Marco P.');
    // e ha effettivamente scritto su DynamoDB con visibilita privata
    const item = ddb.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item?.visibilita).toBe('privato');
  });

  it('scarta coordinate fuori range (lat 999 → null)', async () => {
    const { body } = parseResult(await handler(apiEvent({
      claims: citizen,
      body: { titolo: 'Titolo valido', descrizione: 'descrizione valida', lat: 999, lng: 12 },
    })));
    expect(body.lat).toBeNull();
    expect(body.lng).toBe(12);
  });
});
