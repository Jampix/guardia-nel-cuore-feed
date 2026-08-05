import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/foto.jpg'),
}));

import { handler } from './list-my-feedback';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);

/**
 * "I miei feedback": è l'unica vista in cui il cittadino vede anche le proprie
 * proposte private. Due garanzie da non perdere: si leggono solo le PROPRIE, e
 * la nota interna dello staff non deve mai uscire.
 */
beforeEach(() => {
  ddb.reset();
  ddb.on(QueryCommand).resolves({ Items: [{ id: 'f1', titolo: 'Mia proposta' }] });
});

describe('list-my-feedback', () => {
  it('401 senza autenticazione', async () => {
    const { status } = parseResult(await handler(apiEvent({ method: 'GET', claims: {} })));
    expect(status).toBe(401);
    expect(ddb.commandCalls(QueryCommand).length).toBe(0);
  });

  it('interroga solo le proposte dell\'utente del token', async () => {
    // Se la chiave venisse da un parametro della richiesta si potrebbero leggere
    // le proposte private di chiunque: deve arrivare dal token e solo da lì.
    await handler(apiEvent({ method: 'GET', claims: { sub: 'user-1' } }));

    const input = ddb.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.IndexName).toBe('byAutore');
    expect(input.ExpressionAttributeValues).toEqual({ ':a': 'user-1' });
  });

  it('NON espone mai la nota interna dello staff', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [{ id: 'f1', titolo: 'Mia', notaInterna: 'sentire ufficio tecnico' }],
    });

    const { body } = parseResult(await handler(apiEvent({ method: 'GET', claims: { sub: 'user-1' } })));

    expect(body[0].notaInterna).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('ufficio tecnico');
  });

  it('firma l\'URL della foto solo quando c\'è', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [{ id: 'con', fotoKey: 'feedback/x.jpg' }, { id: 'senza' }],
    });

    const { body } = parseResult(await handler(apiEvent({ method: 'GET', claims: { sub: 'u' } })));

    expect(body.find((f: any) => f.id === 'con').fotoUrl).toBe('https://signed.example/foto.jpg');
    expect(body.find((f: any) => f.id === 'senza').fotoUrl).toBeUndefined();
  });

  it('chiede l\'ordine dal più recente', async () => {
    await handler(apiEvent({ method: 'GET', claims: { sub: 'u' } }));
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input.ScanIndexForward).toBe(false);
  });
});
