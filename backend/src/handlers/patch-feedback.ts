import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;

const STATI = ['proposta', 'in_valutazione', 'in_lavorazione', 'risolto', 'archiviato'];

/**
 * PATCH /admin/feedback/{id} — moderazione (staff). Aggiorna in modo parziale
 * `stato`, `rispostaPubblica` (visibile ai cittadini) e `notaInterna` (solo
 * staff). Controllo gruppo admin/membro dal claim `cognito:groups`.
 * TODO: al cambio stato inviare email al cittadino (SES, da configurare).
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  const groups = String(claims['cognito:groups'] ?? '');
  if (!/\b(admin|membro)\b/.test(groups)) {
    return resp(403, { message: 'Accesso riservato allo staff.' });
  }

  const id = event.pathParameters?.id;
  if (!id) return resp(400, { message: 'id mancante' });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return resp(400, { message: 'JSON non valido' });
  }

  const sets: string[] = ['updatedAt = :u'];
  const values: Record<string, unknown> = { ':u': new Date().toISOString() };
  const names: Record<string, string> = {};

  if (body.stato !== undefined) {
    if (!STATI.includes(String(body.stato))) return resp(400, { message: 'stato non valido' });
    sets.push('#stato = :stato');
    names['#stato'] = 'stato';
    values[':stato'] = String(body.stato);
  }
  if (body.rispostaPubblica !== undefined) {
    sets.push('rispostaPubblica = :rp');
    values[':rp'] = String(body.rispostaPubblica);
  }
  if (body.notaInterna !== undefined) {
    sets.push('notaInterna = :ni');
    values[':ni'] = String(body.notaInterna);
  }

  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: FEEDBACKS_TABLE,
        Key: { id },
        UpdateExpression: 'SET ' + sets.join(', '),
        ExpressionAttributeValues: values,
        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
        ConditionExpression: 'attribute_exists(id)',
        ReturnValues: 'ALL_NEW',
      }),
    );
    return resp(200, res.Attributes);
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') {
      return resp(404, { message: 'Feedback non trovato' });
    }
    throw e;
  }
};

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
