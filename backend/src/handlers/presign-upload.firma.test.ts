import { describe, expect, it } from 'vitest';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Il tetto ai 5 MB regge su un'assunzione sull'SDK: che `ContentLength` finisca
 * fra gli header FIRMATI dell'URL prefirmato. Se non ci finisse, il controllo
 * lato server resterebbe (buono) ma S3 non farebbe rispettare nulla, e un PUT
 * diretto potrebbe caricare un file di qualunque dimensione: la correzione
 * diventerebbe un no-op **silenzioso**, senza errori da nessuna parte.
 *
 * Qui si usa il presigner VERO (non il mock di presign-upload.test.ts), con
 * credenziali finte: la firma è un calcolo locale, non serve rete né AWS.
 */
const s3 = new S3Client({
  region: 'eu-west-1',
  credentials: { accessKeyId: 'AKIAFINTE', secretAccessKey: 'finta' },
});

function headerFirmati(url: string): string[] {
  return (new URL(url).searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
}

describe('contratto del presigner S3', () => {
  it('firma content-length quando si dichiara ContentLength', async () => {
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: 'b',
        Key: 'feedback/x.jpg',
        ContentType: 'image/jpeg',
        ContentLength: 1234,
      }),
      { expiresIn: 300 },
    );
    expect(headerFirmati(url)).toContain('content-length');
  });

  it('senza ContentLength non firma nulla sulla dimensione', async () => {
    // Mostra che è la nostra dichiarazione a fare la differenza, non un
    // comportamento che l'SDK avrebbe comunque.
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: 'b', Key: 'feedback/x.jpg', ContentType: 'image/jpeg' }),
      { expiresIn: 300 },
    );
    expect(headerFirmati(url)).not.toContain('content-length');
  });

  it('NON firma content-type: non va usato come controllo', async () => {
    // Fissa il limite scoperto verificando l'SDK, così nessuno ci costruisce
    // sopra una garanzia. Se un giorno l'SDK iniziasse a firmarlo, questo test
    // fallisce ed è il momento di riconsiderare la difesa sul tipo di file.
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: 'b',
        Key: 'feedback/x.jpg',
        ContentType: 'image/jpeg',
        ContentLength: 10,
      }),
      { expiresIn: 300 },
    );
    const u = new URL(url);
    expect(headerFirmati(url)).not.toContain('content-type');
    expect([...u.searchParams.keys()].map((k) => k.toLowerCase())).not.toContain('content-type');
  });
});
