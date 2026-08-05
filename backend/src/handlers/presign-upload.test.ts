import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// `vi.hoisted` perche' il factory di vi.mock viene issato in cima al file e
// non puo' riferirsi a una costante dichiarata dopo.
const { getSignedUrl } = vi.hoisted(() => ({ getSignedUrl: vi.fn() }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl }));

import { handler } from './presign-upload';
import { apiEvent, parseResult } from './_test-helpers';

mockClient(S3Client);

const auth = { sub: 'user-1' };

/**
 * URL prefirmato per caricare una foto direttamente su S3. È l'unico punto in
 * cui un cittadino ottiene un permesso di scrittura sul bucket, quindi conta
 * cosa esattamente viene firmato: tipo di file, nome della chiave e durata.
 */
function presign(body: unknown, claims: Record<string, unknown> = auth) {
  return handler(apiEvent({ method: 'POST', claims, body }));
}

/** Argomenti dell'ultima firma richiesta. */
function firmato() {
  const [, cmd, opts] = getSignedUrl.mock.calls.at(-1) ?? [];
  return { input: (cmd as PutObjectCommand)?.input as any, opts: opts as any };
}

beforeEach(() => {
  getSignedUrl.mockReset();
  getSignedUrl.mockResolvedValue('https://signed.example/put');
});

describe('presign-upload', () => {
  it('401 senza autenticazione', async () => {
    const { status } = parseResult(await presign({ contentType: 'image/jpeg' }, {}));
    expect(status).toBe(401);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('accetta solo JPEG, PNG e WebP', async () => {
    for (const ct of ['image/jpeg', 'image/png', 'image/webp']) {
      const { status } = parseResult(await presign({ contentType: ct }));
      expect(status, ct).toBe(200);
    }
  });

  it('rifiuta i tipi non ammessi, senza firmare nulla', async () => {
    // Un SVG può contenere script, e application/* aprirebbe il bucket a
    // qualunque file: il rifiuto deve avvenire PRIMA della firma.
    for (const ct of ['image/svg+xml', 'text/html', 'application/pdf', '', 'image/gif']) {
      getSignedUrl.mockClear();
      const { status } = parseResult(await presign({ contentType: ct }));
      expect(status, ct || '(vuoto)').toBe(400);
      expect(getSignedUrl).not.toHaveBeenCalled();
    }
  });

  it('vincola la firma al Content-Type dichiarato', async () => {
    await presign({ contentType: 'image/png' });
    expect(firmato().input.ContentType).toBe('image/png');
  });

  it('genera la chiave lato server, con estensione coerente', async () => {
    // La chiave NON deve arrivare dal client: altrimenti si potrebbe scrivere
    // fuori dal prefisso previsto o sovrascrivere la foto di un altro.
    const { body } = parseResult(await presign({
      contentType: 'image/webp',
      key: '../../altrove/x.php',
      fotoKey: 'feedback/vittima.jpg',
    }));

    expect(body.key).toMatch(/^feedback\/[0-9a-f-]{36}\.webp$/);
    expect(body.key).not.toContain('..');
    expect(body.key).not.toContain('vittima');
  });

  it('ogni richiesta ottiene una chiave diversa', async () => {
    const a = parseResult(await presign({ contentType: 'image/jpeg' })).body.key;
    const b = parseResult(await presign({ contentType: 'image/jpeg' })).body.key;
    expect(a).not.toBe(b);
  });

  it('l\'URL scade in pochi minuti', async () => {
    await presign({ contentType: 'image/jpeg' });
    expect(firmato().opts.expiresIn).toBeLessThanOrEqual(600);
  });

  it('400 se il corpo non è JSON valido', async () => {
    const ev = apiEvent({ method: 'POST', claims: auth });
    const { status } = parseResult(await handler({ ...ev, body: '{non json' } as any));
    expect(status).toBe(400);
  });
});
