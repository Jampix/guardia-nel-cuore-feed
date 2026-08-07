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
  // `size` e' obbligatoria: la si aggiunge di default perche' la maggior parte
  // dei casi verifica altro, e i suoi test la passano esplicitamente.
  const completo =
    body && typeof body === 'object' && !('size' in body) ? { ...body, size: 1024 } : body;
  return handler(apiEvent({ method: 'POST', claims, body: completo }));
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

  it('passa a S3 il Content-Type dichiarato (che pero\' NON e\' un vincolo)', async () => {
    // ⚠️ Verificato con l'SDK: il presigner NON include `content-type` fra gli
    // header firmati ne' fra i parametri della query, quindi chi ha l'URL puo'
    // caricare byte di qualunque tipo. Il tipo dichiarato serve a due cose:
    // scegliere l'estensione della chiave (lato server) e finire nei metadati.
    // Non si deve ragionare come se fosse un controllo: quello che vincola
    // davvero e' `content-length` (vedi presign-upload.firma.test.ts).
    await presign({ contentType: 'image/png' });
    expect(firmato().input.ContentType).toBe('image/png');
  });

  describe('tetto alla dimensione', () => {
    it('firma la dimensione dichiarata, cosi\' S3 la fa rispettare', async () => {
      await presign({ contentType: 'image/jpeg', size: 4096 });
      expect(firmato().input.ContentLength).toBe(4096);
    });

    it('rifiuta una foto oltre i 5 MB senza firmare nulla', async () => {
      const { status, body } = parseResult(await presign({
        contentType: 'image/jpeg', size: 5 * 1024 * 1024 + 1,
      }));
      expect(status).toBe(400);
      expect(body.message).toContain('5 MB');
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('accetta esattamente 5 MB', async () => {
      // Il confine va deciso, non lasciato al caso: il messaggio dice "supera".
      const { status } = parseResult(await presign({
        contentType: 'image/jpeg', size: 5 * 1024 * 1024,
      }));
      expect(status).toBe(200);
    });

    it('rifiuta dimensioni assenti o assurde', async () => {
      // Senza questi controlli un `size` mancante diventerebbe ContentLength
      // NaN e la firma sarebbe inutilizzabile, oppure un valore negativo
      // passerebbe il confronto col tetto.
      for (const size of [undefined, 0, -1, 1.5, 'molti', null]) {
        getSignedUrl.mockClear();
        const { status } = parseResult(await presign({ contentType: 'image/jpeg', size }));
        expect(status, `size=${size}`).toBe(400);
        expect(getSignedUrl).not.toHaveBeenCalled();
      }
    });
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
