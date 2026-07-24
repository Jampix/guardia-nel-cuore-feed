import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { handler } from './patch-feedback';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const cognito = mockClient(CognitoIdentityProviderClient);

const staff = { sub: 'admin-1', 'cognito:groups': 'admin' };
const cittadino = { sub: 'user-1', 'cognito:groups': 'cittadino' };

beforeEach(() => {
  ddb.reset(); ses.reset(); cognito.reset();
  ses.on(SendEmailCommand).resolves({});
  cognito.on(AdminGetUserCommand).resolves({ UserAttributes: [{ Name: 'email', Value: 'a@b.it' }] });
});

describe('patch-feedback', () => {
  it('403 se il chiamante non è staff', async () => {
    const { status } = parseResult(await handler(apiEvent({
      method: 'PATCH', claims: cittadino, pathParameters: { id: 'f1' }, body: { stato: 'risolto' },
    })));
    expect(status).toBe(403);
    expect(ddb.commandCalls(UpdateCommand).length).toBe(0);
  });

  it('lo staff aggiorna stato e visibilità', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { id: 'f1', stato: 'in_lavorazione', visibilita: 'pubblico' } });
    const { status, body } = parseResult(await handler(apiEvent({
      method: 'PATCH', claims: staff, pathParameters: { id: 'f1' }, body: { stato: 'in_lavorazione', visibilita: 'pubblico' },
    })));
    expect(status).toBe(200);
    expect(body.visibilita).toBe('pubblico');
    const expr = ddb.commandCalls(UpdateCommand)[0].args[0].input.UpdateExpression as string;
    expect(expr).toContain('visibilita');
  });

  it('404 se la proposta non esiste', async () => {
    const err: any = new Error('nope'); err.name = 'ConditionalCheckFailedException';
    ddb.on(UpdateCommand).rejects(err);
    const { status } = parseResult(await handler(apiEvent({
      method: 'PATCH', claims: staff, pathParameters: { id: 'inesistente' }, body: { rispostaPubblica: 'ok' },
    })));
    expect(status).toBe(404);
  });
});
