import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

  const res = await ddb.send(new ScanCommand({ TableName: FEEDBACKS_TABLE }));
  const sorted = (res.Items ?? []).sort((a, b) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  );

  const items = await Promise.all(
    sorted.map(async (item) => {
      if (!item.fotoKey) return item;
      const fotoUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: PHOTO_BUCKET, Key: String(item.fotoKey) }),
        { expiresIn: 3600 },
      );
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
