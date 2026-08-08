import { describe, expect, it } from 'vitest';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { urlFoto } from './foto-url';

/**
 * Il tipo dichiarato al caricamento NON è un vincolo: il presigner non firma
 * `content-type` (vedi `handlers/presign-upload.firma.test.ts`), quindi nel
 * bucket può finire qualunque byte sotto una chiave `.jpg` — per esempio HTML.
 * La difesa è in lettura: imporre il tipo con cui S3 serve il file.
 *
 * Presigner vero e credenziali finte: la firma è un calcolo locale.
 */
const s3 = new S3Client({
  region: 'eu-west-1',
  credentials: { accessKeyId: 'AKIAFINTE', secretAccessKey: 'finta' },
});

const param = async (key: string, nome: string) =>
  new URL(await urlFoto(s3, 'bucket-test', key)).searchParams.get(nome);

describe('urlFoto', () => {
  it('impone il tipo immagine ricavandolo dall\'estensione della chiave', async () => {
    expect(await param('feedback/a.jpg', 'response-content-type')).toBe('image/jpeg');
    expect(await param('feedback/a.png', 'response-content-type')).toBe('image/png');
    expect(await param('feedback/a.webp', 'response-content-type')).toBe('image/webp');
  });

  it('serve la foto dentro la pagina, non come scaricamento', async () => {
    expect(await param('feedback/a.jpg', 'response-content-disposition')).toBe('inline');
  });

  it('un\'estensione inattesa diventa un allegato binario', async () => {
    // Non dovrebbe accadere (la chiave la genera il server), ma se accadesse la
    // scelta sicura è quella che il browser non esegue: né tipo dichiarato dal
    // contenuto, né visualizzazione nella pagina.
    for (const k of ['feedback/a.html', 'feedback/a.svg', 'feedback/a', 'feedback/a.JPG.html']) {
      expect(await param(k, 'response-content-type'), k).toBe('application/octet-stream');
      expect(await param(k, 'response-content-disposition'), k).toBe('attachment');
    }
  });

  it('riconosce l\'estensione anche in maiuscolo', async () => {
    expect(await param('feedback/a.JPG', 'response-content-type')).toBe('image/jpeg');
  });

  it('il tipo imposto è coperto dalla firma, quindi non si aggira modificando l\'URL', async () => {
    // È il punto su cui regge tutta la difesa: se `response-content-type` non
    // entrasse nella firma, chi ha il link potrebbe rimetterlo a `text/html` e
    // farsi servire come pagina ciò che ha caricato.
    //
    // Non potendo interrogare S3, si isola la variabile: stessa chiave, stessa
    // scadenza, **stessa data di firma** (fissata: due chiamate a un secondo di
    // distanza darebbero firme diverse per l'orario, e il confronto sarebbe
    // fragile), e cambia solo il parametro. Firma diversa ⇒ il parametro fa
    // parte del canonical request ⇒ l'URL manomesso non verifica.
    const signingDate = new Date('2026-08-08T10:00:00Z');
    const firma = async (extra: Record<string, string>) =>
      new URL(
        await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: 'bucket-test', Key: 'feedback/a.jpg', ...extra }),
          { expiresIn: 3600, signingDate },
        ),
      ).searchParams.get('X-Amz-Signature');

    const conImmagine = await firma({ ResponseContentType: 'image/jpeg' });
    const conHtml = await firma({ ResponseContentType: 'text/html' });
    const senzaNulla = await firma({});

    expect(conImmagine).not.toBe(conHtml);
    expect(conImmagine).not.toBe(senzaNulla);
    // Controprova che il confronto sia significativo: a parità di tutto la
    // firma è stabile, quindi le differenze sopra vengono dal parametro.
    expect(await firma({ ResponseContentType: 'image/jpeg' })).toBe(conImmagine);
  });
});
