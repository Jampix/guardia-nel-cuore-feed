import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const PHOTO_BUCKET = process.env.PHOTO_BUCKET as string;

/**
 * GET /feedback/public — bacheca pubblica (endpoint pubblico, senza auth).
 *
 * Interroga il GSI `byVisibilita` (PK `visibilita`, SK `createdAt`) filtrando
 * i soli feedback `pubblico`, dal più recente. Il bucket foto è privato:
 * per ogni feedback con `fotoKey` genero al volo un URL GET prefirmato
 * (`fotoUrl`, valido ~1h) così il client può mostrare l'immagine.
 */
export const handler = async (): Promise<APIGatewayProxyResultV2> => {
  const res = await ddb.send(
    new QueryCommand({
      TableName: FEEDBACKS_TABLE,
      IndexName: 'byVisibilita',
      KeyConditionExpression: 'visibilita = :v',
      ExpressionAttributeValues: { ':v': 'pubblico' },
      ScanIndexForward: false,
      Limit: 50,
    }),
  );

  const items = await Promise.all(
    (res.Items ?? []).map(async (item) => {
      if (!item.fotoKey) return item;
      const fotoUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: PHOTO_BUCKET, Key: String(item.fotoKey) }),
        { expiresIn: 3600 },
      );
      return { ...item, fotoUrl };
    }),
  );

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(items),
  };
};
