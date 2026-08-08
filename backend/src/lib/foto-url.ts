import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Estensione della chiave → tipo con cui la foto va servita. */
const TIPO: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * URL prefirmato per LEGGERE una foto, forzando il tipo con cui S3 la serve.
 *
 * Serve perché il tipo dichiarato al momento del caricamento **non è un
 * vincolo**: il presigner non firma `content-type` (verificato con l'SDK, vedi
 * `presign-upload.firma.test.ts`), quindi chi ottiene l'URL di scrittura può
 * mandare byte di qualunque natura — per esempio HTML — e S3 conserva il tipo
 * che il client ha dichiarato. Un link aperto direttamente lo servirebbe come
 * tale, ed è così che una foto diventa una pagina che esegue codice.
 *
 * La difesa sta in lettura, dove il controllo ce l'abbiamo: `response-content-*`
 * sono parametri FIRMATI, quindi il tipo servito lo decidiamo noi e non può
 * essere modificato manomettendo l'URL. Il tipo si ricava dall'estensione della
 * chiave, che è **scelta dal server** fra quelle ammesse.
 *
 * `inline` perché le foto si mostrano nella pagina; l'accoppiata con un tipo
 * `image/*` imposto rende irrilevante ciò che è stato caricato: il browser non
 * eseguirà mai quel contenuto come documento.
 */
export function urlFoto(
  s3: S3Client,
  bucket: string,
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  // Chiave con estensione inattesa (non dovrebbe accadere: la genera il server):
  // si serve come binario da scaricare, che è la scelta che non esegue nulla.
  const tipo = TIPO[ext] ?? 'application/octet-stream';
  const disposizione = TIPO[ext] ? 'inline' : 'attachment';

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: tipo,
      ResponseContentDisposition: disposizione,
    }),
    { expiresIn },
  );
}
