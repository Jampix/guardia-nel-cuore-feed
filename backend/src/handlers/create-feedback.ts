import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;

/**
 * POST /feedback — crea un feedback (richiede autenticazione JWT Cognito).
 *
 * L'autore è ricavato dai claim del token (mai dal body). Il cittadino sceglie
 * la visibilità: `pubblico` (votabile) o `privato` (default).
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  const autoreId = String(claims.sub ?? '');
  const autoreNick = String(claims.nickname ?? claims.email ?? 'Anonimo');
  if (!autoreId) return resp(401, { message: 'Non autenticato' });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return resp(400, { message: 'JSON non valido' });
  }

  const titolo = String(body.titolo ?? '').trim();
  const descrizione = String(body.descrizione ?? '').trim();
  if (!titolo || !descrizione) {
    return resp(400, { message: 'titolo e descrizione sono obbligatori' });
  }

  const now = new Date().toISOString();
  const item = {
    id: randomUUID(),
    titolo,
    descrizione,
    categoriaId: body.categoriaId ? String(body.categoriaId) : null,
    visibilita: body.visibilita === 'pubblico' ? 'pubblico' : 'privato',
    stato: 'ricevuto',
    autoreId,
    autoreNick,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    luogo: body.luogo ? String(body.luogo) : null,
    fotoUrl: body.fotoUrl ? String(body.fotoUrl) : null,
    numeroVoti: 0,
    lingua: body.lingua === 'en' ? 'en' : 'it',
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: FEEDBACKS_TABLE, Item: item }));
  return resp(201, item);
};

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
