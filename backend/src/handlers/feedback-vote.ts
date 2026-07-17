import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
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
 *  - POST: aggiunge il voto (1 per utente, garantito dalla chiave) e incrementa il contatore.
 *  - DELETE: ritira il voto e decrementa.
 * L'utente è ricavato dal token (claim `sub`), mai dal body.
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
      await ddb.send(
        new PutCommand({
          TableName: VOTES_TABLE,
          Item: { feedbackId, userId, createdAt: new Date().toISOString() },
          ConditionExpression: 'attribute_not_exists(feedbackId)',
        }),
      );
    } catch (e: any) {
      if (e?.name === 'ConditionalCheckFailedException') return resp(200, { voted: true });
      throw e;
    }
    const upd = await bumpCounter(feedbackId, 1);
    return resp(200, { voted: true, numeroVoti: upd });
  }

  if (method === 'DELETE') {
    try {
      await ddb.send(
        new DeleteCommand({
          TableName: VOTES_TABLE,
          Key: { feedbackId, userId },
          ConditionExpression: 'attribute_exists(feedbackId)',
        }),
      );
    } catch (e: any) {
      if (e?.name === 'ConditionalCheckFailedException') return resp(200, { voted: false });
      throw e;
    }
    const upd = await bumpCounter(feedbackId, -1);
    return resp(200, { voted: false, numeroVoti: upd });
  }

  return resp(405, { message: 'Metodo non supportato' });
};

/** Incrementa/decrementa numeroVoti in modo atomico e restituisce il nuovo valore. */
async function bumpCounter(feedbackId: string, delta: number): Promise<number | undefined> {
  const upd = await ddb.send(
    new UpdateCommand({
      TableName: FEEDBACKS_TABLE,
      Key: { id: feedbackId },
      UpdateExpression: 'ADD numeroVoti :d',
      ExpressionAttributeValues: { ':d': delta },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return upd.Attributes?.numeroVoti as number | undefined;
}

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
