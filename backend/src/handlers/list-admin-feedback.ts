import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { scanAll } from '../lib/ddb-paginate';
import { S3Client } from '@aws-sdk/client-s3';
import { urlFoto } from '../lib/foto-url';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const PHOTO_BUCKET = process.env.PHOTO_BUCKET as string;

/**
 * GET /admin/feedback — tutti i feedback (anche privati) per il backoffice.
 *
 * La rotta è autenticata (JWT), ma l'authorizer non controlla il ruolo:
 * qui verifichiamo che il chiamante sia nel gruppo `admin` o `membro`
 * (claim `cognito:groups`). Per ogni foto genera un URL GET prefirmato.
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  const groups = String(claims['cognito:groups'] ?? '');
  if (!/\b(admin|membro)\b/.test(groups)) {
    return resp(403, { message: 'Accesso riservato allo staff.' });
  }

  // Paginato: oltre 1 MB di proposte lo Scan ne restituirebbe solo una parte e
  // il backoffice smetterebbe di mostrarne alcune senza alcun errore.
  const all = await scanAll(ddb, { TableName: FEEDBACKS_TABLE });
  const sorted = all.sort((a, b) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  );

  const items = await Promise.all(
    sorted.map(async (item) => {
      if (!item.fotoKey) return item;
      const fotoUrl = await urlFoto(s3, PHOTO_BUCKET, String(item.fotoKey));
      return { ...item, fotoUrl };
    }),
  );

  return resp(200, items);
};

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
