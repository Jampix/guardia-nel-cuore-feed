import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const s3 = new S3Client({});
const PHOTO_BUCKET = process.env.PHOTO_BUCKET as string;

// Tipi immagine ammessi → estensione file.
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Tetto alla dimensione della foto, lo stesso annunciato nel form.
 *
 * Prima esisteva SOLO nel form Angular: la firma copriva bucket, chiave e tipo,
 * non la dimensione, quindi chi aveva l'URL prefirmato poteva caricare un file
 * di gigabyte con un PUT diretto. Non serviva forzare nulla — bastava un
 * account approvato — ed era l'unica spesa dell'app che nessuno limitava.
 */
const MAX_BYTE = 5 * 1024 * 1024;

/**
 * POST /uploads/presign — restituisce un URL prefirmato per caricare una foto
 * direttamente su S3 dal browser (PUT), senza far passare il file da Lambda.
 * Autenticata (JWT Cognito). Il client dovrà usare lo stesso Content-Type.
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  if (!claims.sub) return resp(401, { message: 'Non autenticato' });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return resp(400, { message: 'JSON non valido' });
  }

  const contentType = String(body.contentType ?? '');
  const ext = EXT[contentType];
  if (!ext) {
    return resp(400, { message: 'Formato non supportato (usa JPEG, PNG o WebP).' });
  }

  // La dimensione dichiarata entra nella firma (`content-length` finisce fra gli
  // header firmati, verificato con l'SDK): S3 rifiuta il PUT che non la rispetta,
  // quindi il tetto non è più una gentile richiesta al client.
  const size = Number(body.size);
  if (!Number.isInteger(size) || size <= 0) {
    return resp(400, { message: 'Dimensione del file mancante o non valida.' });
  }
  if (size > MAX_BYTE) {
    return resp(400, { message: `La foto supera ${MAX_BYTE / 1024 / 1024} MB.` });
  }

  const key = `feedback/${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: PHOTO_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn: 300 }, // 5 minuti per completare l'upload
  );

  return resp(200, { uploadUrl, key });
};

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
