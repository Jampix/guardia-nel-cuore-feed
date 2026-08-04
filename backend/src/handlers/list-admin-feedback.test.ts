import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { apiEvent, parseResult } from './_test-helpers';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/foto.jpg'),
}));

import { handler } from './list-admin-feedback';

const ddb = mockClient(DynamoDBDocumentClient);
mockClient(S3Client);

const staff = { sub: 'admin-1', 'cognito:groups': 'admin' };
const membro = { sub: 'm-1', 'cognito:groups': 'membro' };
const cittadino = { sub: 'u-1', 'cognito:groups': 'cittadino' };

/**
 * Elenco completo per il backoffice. È l'unica vista che mostra anche le
 * proposte private, quindi il controllo del ruolo qui è l'unica barriera:
 * l'authorizer valida il token ma non il gruppo.
 */
function feedback(over: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    titolo: 'Pista ciclabile',
    visibilita: 'privato',
    createdAt: '2026-07-01T10:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  ddb.reset();
  ddb.on(ScanCommand).resolves({ Items: [feedback()] });
});

describe('list-admin-feedback', () => {
  it('403 per un cittadino: non deve vedere le proposte private', async () => {
    const { status } = parseResult(await handler(apiEvent({ method: 'GET', claims: cittadino })));
    expect(status).toBe(403);
    expect(ddb.commandCalls(ScanCommand).length).toBe(0);
  });

  it('403 senza alcun gruppo', async () => {
    const { status } = parseResult(await handler(apiEvent({ method: 'GET', claims: { sub: 'x' } })));
    expect(status).toBe(403);
  });

  it('consentito ad `admin` e a `membro`', async () => {
    for (const claims of [staff, membro]) {
      const { status } = parseResult(await handler(apiEvent({ method: 'GET', claims })));
      expect(status).toBe(200);
    }
  });

  it('ordina dalla più recente', async () => {
    ddb.on(ScanCommand).resolves({
      Items: [
        feedback({ id: 'vecchia', createdAt: '2026-06-01T10:00:00.000Z' }),
        feedback({ id: 'nuova', createdAt: '2026-07-20T10:00:00.000Z' }),
      ],
    });

    const { body } = parseResult(await handler(apiEvent({ method: 'GET', claims: staff })));

    expect(body.map((f: any) => f.id)).toEqual(['nuova', 'vecchia']);
  });

  it('genera l\'URL prefirmato solo se c\'è una foto', async () => {
    ddb.on(ScanCommand).resolves({
      Items: [feedback({ id: 'con', fotoKey: 'feedback/x.jpg' }), feedback({ id: 'senza' })],
    });

    const { body } = parseResult(await handler(apiEvent({ method: 'GET', claims: staff })));

    expect(body.find((f: any) => f.id === 'con').fotoUrl).toBe('https://signed.example/foto.jpg');
    expect(body.find((f: any) => f.id === 'senza').fotoUrl).toBeUndefined();
  });

  it('legge TUTTE le pagine, non solo la prima', async () => {
    // Senza paginazione, oltre 1 MB di proposte il backoffice ne mostrerebbe
    // solo una parte, senza alcun errore: lo staff modererebbe a metà.
    ddb.on(ScanCommand)
      .resolvesOnce({ Items: [feedback({ id: 'pag1' })], LastEvaluatedKey: { id: 'pag1' } })
      .resolvesOnce({ Items: [feedback({ id: 'pag2' })] });

    const { body } = parseResult(await handler(apiEvent({ method: 'GET', claims: staff })));

    expect(body.map((f: any) => f.id).sort()).toEqual(['pag1', 'pag2']);
  });
});
