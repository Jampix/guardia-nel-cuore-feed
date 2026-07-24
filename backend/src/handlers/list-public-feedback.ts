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
// Tetto di sicurezza: a questa scala (un comune) i feedback pubblici stanno
// ampiamente sotto. Ordinamento/ricerca/paginazione avvengono lato client.
const MAX_ITEMS = 500;

export const handler = async (): Promise<APIGatewayProxyResultV2> => {
  const rows: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: FEEDBACKS_TABLE,
        IndexName: 'byVisibilita',
        KeyConditionExpression: 'visibilita = :v',
        ExpressionAttributeValues: { ':v': 'pubblico' },
        ScanIndexForward: false, // più recenti prima
        ExclusiveStartKey: lastKey,
      }),
    );
    rows.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey && rows.length < MAX_ITEMS);

  const items = await Promise.all(
    rows.slice(0, MAX_ITEMS).map(async (item) => {
      // La nota interna dello staff non deve MAI finire nella risposta pubblica.
      const { notaInterna, ...pub } = item;
      if (!pub.fotoKey) return pub;
      const fotoUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: PHOTO_BUCKET, Key: String(pub.fotoKey) }),
        { expiresIn: 3600 },
      );
      return { ...pub, fotoUrl };
    }),
  );

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(items),
  };
};
