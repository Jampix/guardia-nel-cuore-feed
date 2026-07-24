import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './feedback-vote';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const voter = { sub: 'user-9' };

beforeEach(() => ddb.reset());

describe('feedback-vote', () => {
  it('401 senza autenticazione', async () => {
    const { status } = parseResult(await handler(apiEvent({ method: 'POST', claims: {}, pathParameters: { id: 'f1' } })));
    expect(status).toBe(401);
  });

  it('400 senza id proposta', async () => {
    const { status } = parseResult(await handler(apiEvent({ method: 'POST', claims: voter })));
    expect(status).toBe(400);
  });

  it('GET riporta se hai già votato', async () => {
    ddb.on(GetCommand).resolves({ Item: { feedbackId: 'f1', userId: 'user-9' } });
    const { status, body } = parseResult(await handler(apiEvent({ method: 'GET', claims: voter, pathParameters: { id: 'f1' } })));
    expect(status).toBe(200);
    expect(body.voted).toBe(true);
  });

  it('POST registra il voto in un\'unica transazione', async () => {
    ddb.on(TransactWriteCommand).resolves({});
    ddb.on(GetCommand).resolves({ Item: { numeroVoti: 5 } });
    const { status, body } = parseResult(await handler(apiEvent({ method: 'POST', claims: voter, pathParameters: { id: 'f1' } })));
    expect(status).toBe(200);
    expect(body.voted).toBe(true);
    expect(body.numeroVoti).toBe(5);
    // ha usato una TransactWriteItems (voto + contatore atomici)
    expect(ddb.commandCalls(TransactWriteCommand).length).toBe(1);
  });

  it('POST idempotente: se hai già votato non fallisce', async () => {
    const err: any = new Error('cancelled');
    err.name = 'TransactionCanceledException';
    ddb.on(TransactWriteCommand).rejects(err);
    ddb.on(GetCommand).resolves({ Item: { numeroVoti: 5 } });
    const { status, body } = parseResult(await handler(apiEvent({ method: 'POST', claims: voter, pathParameters: { id: 'f1' } })));
    expect(status).toBe(200);
    expect(body.voted).toBe(true);
  });
});
