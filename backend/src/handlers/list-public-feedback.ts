import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;

/**
 * GET /feedback/public — bacheca pubblica (endpoint pubblico, senza auth).
 *
 * Interroga il GSI `byVisibilita` (PK `visibilita`, SK `createdAt`) filtrando
 * i soli feedback `pubblico`, dal più recente. Il GSI evita uno Scan sull'intera
 * tabella. Limite prudenziale a 50 (paginazione futura via `LastEvaluatedKey`).
 */
export const handler = async (): Promise<APIGatewayProxyResultV2> => {
  const res = await ddb.send(
    new QueryCommand({
      TableName: FEEDBACKS_TABLE,
      IndexName: 'byVisibilita',
      KeyConditionExpression: 'visibilita = :v',
      ExpressionAttributeValues: { ':v': 'pubblico' },
      ScanIndexForward: false, // più recenti prima
      Limit: 50,
    }),
  );

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(res.Items ?? []),
  };
};
