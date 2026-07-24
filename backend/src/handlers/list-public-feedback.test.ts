import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// La firma dell'URL foto è simulata (nessuna chiamata reale a S3).
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/photo.jpg'),
}));

import { handler } from './list-public-feedback';
import { parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddb.reset());

describe('list-public-feedback', () => {
  it('non espone MAI la nota interna dello staff', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [{ id: 'f1', titolo: 'Test', visibilita: 'pubblico', notaInterna: 'segreto staff' }],
    });
    const { status, body } = parseResult(await handler({} as any));
    expect(status).toBe(200);
    expect(body[0].titolo).toBe('Test');
    expect(body[0].notaInterna).toBeUndefined();
  });

  it('genera l\'URL prefirmato quando c\'è una foto', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [{ id: 'f2', visibilita: 'pubblico', fotoKey: 'feedback/x.jpg' }],
    });
    const { body } = parseResult(await handler({} as any));
    expect(body[0].fotoUrl).toBe('https://signed.example/photo.jpg');
  });
});
