import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const VOTES_TABLE = process.env.VOTES_TABLE as string;
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;

/**
 * /feedback/{id}/vote — voto del cittadino (autenticato).
 *  - GET: dice se l'utente ha già votato.
 *  - POST: aggiunge il voto (1 per utente) e incrementa il contatore.
 *  - DELETE: ritira il voto e decrementa.
 *
 * Voto e contatore vengono scritti in un'unica **TransactWriteItems**:
 * o vanno a buon fine entrambi o nessuno dei due (niente disallineamenti tra la
 * tabella Votes e `Feedbacks.numeroVoti`). L'utente è dal token (`sub`).
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const userId = String(event.requestContext.authorizer?.jwt?.claims?.sub ?? '');
  if (!userId) return resp(401, { message: 'Non autenticato' });

  const feedbackId = event.pathParameters?.id;
  if (!feedbackId) return resp(400, { message: 'id mancante' });

  const method = event.requestContext.http.method;

  if (method === 'GET') {
    const r = await ddb.send(new GetCommand({ TableName: VOTES_TABLE, Key: { feedbackId, userId } }));
    return resp(200, { voted: !!r.Item });
  }

  if (method === 'POST') {
    try {
      await ddb.send(new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: VOTES_TABLE,
              Item: { feedbackId, userId, createdAt: new Date().toISOString() },
              ConditionExpression: 'attribute_not_exists(feedbackId)',
            },
          },
          {
            Update: {
              TableName: FEEDBACKS_TABLE,
              Key: { id: feedbackId },
              UpdateExpression: 'ADD numeroVoti :d',
              ExpressionAttributeValues: { ':d': 1 },
              ConditionExpression: 'attribute_exists(id)',
            },
          },
        ],
      }));
    } catch (e: any) {
      // Voto già presente (o feedback inesistente): stato invariato.
      if (e?.name === 'TransactionCanceledException') {
        return resp(200, { voted: true, numeroVoti: await readCount(feedbackId) });
      }
      throw e;
    }
    return resp(200, { voted: true, numeroVoti: await readCount(feedbackId) });
  }

  if (method === 'DELETE') {
    try {
      await ddb.send(new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: VOTES_TABLE,
              Key: { feedbackId, userId },
              ConditionExpression: 'attribute_exists(feedbackId)',
            },
          },
          {
            Update: {
              TableName: FEEDBACKS_TABLE,
              Key: { id: feedbackId },
              UpdateExpression: 'ADD numeroVoti :d',
              ExpressionAttributeValues: { ':d': -1 },
              ConditionExpression: 'attribute_exists(id)',
            },
          },
        ],
      }));
    } catch (e: any) {
      // Voto non presente: stato invariato.
      if (e?.name === 'TransactionCanceledException') {
        return resp(200, { voted: false, numeroVoti: await readCount(feedbackId) });
      }
      throw e;
    }
    return resp(200, { voted: false, numeroVoti: await readCount(feedbackId) });
  }

  return resp(405, { message: 'Metodo non supportato' });
};

/** Legge il contatore voti corrente del feedback. */
async function readCount(feedbackId: string): Promise<number | undefined> {
  const r = await ddb.send(new GetCommand({
    TableName: FEEDBACKS_TABLE,
    Key: { id: feedbackId },
    ProjectionExpression: 'numeroVoti',
  }));
  return r.Item?.numeroVoti as number | undefined;
}

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
