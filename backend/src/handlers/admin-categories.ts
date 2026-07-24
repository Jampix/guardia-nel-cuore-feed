import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CATEGORIES_TABLE = process.env.CATEGORIES_TABLE as string;

/**
 * /admin/categories — CRUD categorie (backoffice, gruppo admin/membro).
 * Un solo handler per GET (lista tutte), POST (crea), PATCH (rinomina/attiva),
 * DELETE (elimina). L'endpoint pubblico GET /categories resta separato.
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  const groups = String(claims['cognito:groups'] ?? '');
  if (!/\b(admin|membro)\b/.test(groups)) {
    return resp(403, { message: 'Accesso riservato allo staff.' });
  }

  const method = event.requestContext.http.method;
  const id = event.pathParameters?.id;

  if (method === 'GET') {
    const res = await ddb.send(new ScanCommand({ TableName: CATEGORIES_TABLE }));
    const items = (res.Items ?? []).sort((a, b) =>
      String(a.nome ?? '').localeCompare(String(b.nome ?? '')),
    );
    return resp(200, items);
  }

  if (method === 'POST') {
    const body = parse(event.body);
    const nome = String(body.nome ?? '').trim().slice(0, 60);
    if (!nome) return resp(400, { message: 'Il nome è obbligatorio.' });
    const item = { id: randomUUID(), nome, attiva: true };
    await ddb.send(new PutCommand({ TableName: CATEGORIES_TABLE, Item: item }));
    return resp(201, item);
  }

  if (method === 'PATCH') {
    if (!id) return resp(400, { message: 'id mancante' });
    const body = parse(event.body);
    const sets: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    if (body.nome !== undefined) {
      const nome = String(body.nome).trim().slice(0, 60);
      if (!nome) return resp(400, { message: 'Il nome non può essere vuoto.' });
      sets.push('#nome = :nome');
      names['#nome'] = 'nome';
      values[':nome'] = nome;
    }
    if (body.attiva !== undefined) {
      sets.push('attiva = :attiva');
      values[':attiva'] = Boolean(body.attiva);
    }
    if (!sets.length) return resp(400, { message: 'Niente da aggiornare.' });
    try {
      const res = await ddb.send(
        new UpdateCommand({
          TableName: CATEGORIES_TABLE,
          Key: { id },
          UpdateExpression: 'SET ' + sets.join(', '),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ConditionExpression: 'attribute_exists(id)',
          ReturnValues: 'ALL_NEW',
        }),
      );
      return resp(200, res.Attributes);
    } catch (e: any) {
      if (e?.name === 'ConditionalCheckFailedException') return resp(404, { message: 'Categoria non trovata' });
      throw e;
    }
  }

  if (method === 'DELETE') {
    if (!id) return resp(400, { message: 'id mancante' });
    await ddb.send(new DeleteCommand({ TableName: CATEGORIES_TABLE, Key: { id } }));
    return resp(204, null);
  }

  return resp(405, { message: 'Metodo non supportato' });
};

function parse(body: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(body ?? '{}');
  } catch {
    return {};
  }
}

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: obj === null ? '' : JSON.stringify(obj),
  };
}
