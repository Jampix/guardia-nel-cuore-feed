import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE as string;

/**
 * POST /feedback/{id}/report — segnala una proposta (autenticato).
 *
 * Registra la segnalazione in FeedbackComments con chiave `REPORT#<userId>`
 * (una per utente) e incrementa il contatore `segnalazioni` sul feedback, in
 * un'unica transazione. Se hai già segnalato, l'operazione è idempotente.
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const userId = String(event.requestContext.authorizer?.jwt?.claims?.sub ?? '');
  if (!userId) return resp(401, { message: 'Non autenticato' });

  const feedbackId = event.pathParameters?.id;
  if (!feedbackId) return resp(400, { message: 'id mancante' });

  let motivo = '';
  try {
    motivo = String(JSON.parse(event.body ?? '{}').motivo ?? '').trim().slice(0, 500);
  } catch { /* body facoltativo */ }

  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: COMMENTS_TABLE,
            Item: {
              feedbackId,
              sk: `REPORT#${userId}`,
              tipo: 'REPORT',
              autoreId: userId,
              motivo,
              createdAt: new Date().toISOString(),
            },
            ConditionExpression: 'attribute_not_exists(sk)',
          },
        },
        {
          Update: {
            TableName: FEEDBACKS_TABLE,
            Key: { id: feedbackId },
            UpdateExpression: 'ADD segnalazioni :one',
            ExpressionAttributeValues: { ':one': 1 },
            ConditionExpression: 'attribute_exists(id)',
          },
        },
      ],
    }));
  } catch (e: any) {
    if (e?.name === 'TransactionCanceledException') {
      // Già segnalata da questo utente (o feedback assente): idempotente.
      return resp(200, { reported: true });
    }
    throw e;
  }
  return resp(200, { reported: true });
};

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
