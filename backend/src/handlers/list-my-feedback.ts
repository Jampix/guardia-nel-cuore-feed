import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
 * GET /feedback/mine — le proposte del cittadino autenticato (anche private).
 *
 * Query sul GSI `byAutore` (PK `autoreId`, SK `createdAt`), dal più recente.
 * L'autore è ricavato dal token (claim `sub`). Le foto ricevono un URL GET
 * prefirmato; la nota interna dello staff resta esclusa.
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const autoreId = String(event.requestContext.authorizer?.jwt?.claims?.sub ?? '');
  if (!autoreId) return resp(401, { message: 'Non autenticato' });

  const res = await ddb.send(
    new QueryCommand({
      TableName: FEEDBACKS_TABLE,
      IndexName: 'byAutore',
      KeyConditionExpression: 'autoreId = :a',
      ExpressionAttributeValues: { ':a': autoreId },
      ScanIndexForward: false,
    }),
  );

  const items = await Promise.all(
    (res.Items ?? []).map(async (item) => {
      const { notaInterna, ...mine } = item;
      if (!mine.fotoKey) return mine;
      const fotoUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: PHOTO_BUCKET, Key: String(mine.fotoKey) }),
        { expiresIn: 3600 },
      );
      return { ...mine, fotoUrl };
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
