import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './list-feedback-reports';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);

const staff = { sub: 'a-1', 'cognito:groups': 'admin' };
const cittadino = { sub: 'u-1', 'cognito:groups': 'cittadino' };

/**
 * Motivi delle segnalazioni per lo staff. La garanzia da difendere è la
 * riservatezza di chi segnala: nel dialog di segnalazione promettiamo al
 * cittadino che il suo nome non viene mostrato, e questo endpoint è il punto in
 * cui quella promessa può essere rotta.
 */
beforeEach(() => {
  ddb.reset();
  ddb.on(QueryCommand).resolves({
    Items: [
      { feedbackId: 'f1', sk: 'REPORT#user-9', autoreId: 'user-9', motivo: 'offensivo', createdAt: '2026-07-01' },
    ],
  });
});

describe('list-feedback-reports', () => {
  it('403 per un cittadino', async () => {
    const { status } = parseResult(await handler(apiEvent({
      method: 'GET', claims: cittadino, pathParameters: { id: 'f1' },
    })));
    expect(status).toBe(403);
    expect(ddb.commandCalls(QueryCommand).length).toBe(0);
  });

  it('NON rivela chi ha segnalato', async () => {
    const { body } = parseResult(await handler(apiEvent({
      method: 'GET', claims: staff, pathParameters: { id: 'f1' },
    })));

    expect(body[0].motivo).toBe('offensivo');
    expect(body[0].autoreId).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('user-9');
  });

  it('legge solo le segnalazioni di quella proposta', async () => {
    await handler(apiEvent({ method: 'GET', claims: staff, pathParameters: { id: 'f1' } }));

    const input = ddb.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.KeyConditionExpression).toContain('begins_with(sk, :p)');
    expect(input.ExpressionAttributeValues).toEqual({ ':f': 'f1', ':p': 'REPORT#' });
  });

  it('ordina dalla più recente', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        { motivo: 'vecchia', createdAt: '2026-06-01' },
        { motivo: 'nuova', createdAt: '2026-07-20' },
      ],
    });

    const { body } = parseResult(await handler(apiEvent({
      method: 'GET', claims: staff, pathParameters: { id: 'f1' },
    })));

    expect(body.map((r: any) => r.motivo)).toEqual(['nuova', 'vecchia']);
  });

  it('400 senza id', async () => {
    const { status } = parseResult(await handler(apiEvent({ method: 'GET', claims: staff })));
    expect(status).toBe(400);
  });
});
