import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const VOTES_TABLE = process.env.VOTES_TABLE as string;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE as string;
const PHOTO_BUCKET = process.env.PHOTO_BUCKET as string;

/**
 * /feedback/{id} — gestione della PROPRIA proposta da parte del cittadino.
 *  - PATCH: modifica il testo (titolo/descrizione/categoria/luogo). Consentito
 *    solo se sei l'autore e la proposta è ancora PRIVATA (non pubblicata).
 *  - DELETE: elimina la proposta e i dati collegati (foto, voti, segnalazioni).
 * L'autore è dal token (`sub`); mai modificabili stato/visibilità/voti.
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const userId = String(event.requestContext.authorizer?.jwt?.claims?.sub ?? '');
  if (!userId) return resp(401, { message: 'Non autenticato' });

  const id = event.pathParameters?.id;
  if (!id) return resp(400, { message: 'id mancante' });

  const cur = await ddb.send(new GetCommand({ TableName: FEEDBACKS_TABLE, Key: { id } }));
  const item = cur.Item;
  if (!item) return resp(404, { message: 'Proposta non trovata' });
  if (item.autoreId !== userId) return resp(403, { message: 'Non sei l\'autore di questa proposta' });

  const method = event.requestContext.http.method;

  if (method === 'DELETE') {
    if (item.fotoKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: PHOTO_BUCKET, Key: String(item.fotoKey) }))
        .catch((e) => console.error('Foto non eliminata:', e));
    }
    await deleteAllForFeedback(id);
    await ddb.send(new DeleteCommand({ TableName: FEEDBACKS_TABLE, Key: { id } }));
    return resp(200, { deleted: true });
  }

  if (method === 'PATCH') {
    if (item.visibilita === 'pubblico') {
      return resp(409, { message: 'La proposta è già pubblicata: non è più modificabile. Puoi eliminarla.' });
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return resp(400, { message: 'JSON non valido' });
    }

    const sets: string[] = ['updatedAt = :u'];
    const values: Record<string, unknown> = { ':u': new Date().toISOString() };
    const names: Record<string, string> = {};

    if (body.titolo !== undefined) {
      const t = String(body.titolo).trim();
      if (!t || t.length > 120) return resp(400, { message: 'titolo non valido (1-120)' });
      sets.push('titolo = :t'); values[':t'] = t;
    }
    if (body.descrizione !== undefined) {
      const d = String(body.descrizione).trim();
      if (!d || d.length > 4000) return resp(400, { message: 'descrizione non valida (1-4000)' });
      sets.push('descrizione = :d'); values[':d'] = d;
    }
    if (body.categoriaId !== undefined) {
      sets.push('categoriaId = :c'); values[':c'] = String(body.categoriaId);
    }
    if (body.luogo !== undefined) {
      sets.push('luogo = :l'); values[':l'] = body.luogo ? String(body.luogo).slice(0, 160) : null;
    }
    if (sets.length === 1) return resp(400, { message: 'Niente da aggiornare' });

    const res = await ddb.send(new UpdateCommand({
      TableName: FEEDBACKS_TABLE,
      Key: { id },
      UpdateExpression: 'SET ' + sets.join(', '),
      ExpressionAttributeValues: { ...values, ':a': userId },
      ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
      // Doppia sicurezza: aggiorna solo se ancora tua.
      ConditionExpression: 'autoreId = :a',
      ReturnValues: 'ALL_NEW',
    }));
    return resp(200, res.Attributes);
  }

  return resp(405, { message: 'Metodo non supportato' });
};

/** Elimina voti e segnalazioni collegati a una proposta. */
async function deleteAllForFeedback(feedbackId: string): Promise<void> {
  const votes = await ddb.send(new QueryCommand({
    TableName: VOTES_TABLE,
    KeyConditionExpression: 'feedbackId = :f',
    ExpressionAttributeValues: { ':f': feedbackId },
  }));
  for (const v of votes.Items ?? []) {
    await ddb.send(new DeleteCommand({ TableName: VOTES_TABLE, Key: { feedbackId, userId: v.userId } }));
  }
  const comments = await ddb.send(new QueryCommand({
    TableName: COMMENTS_TABLE,
    KeyConditionExpression: 'feedbackId = :f',
    ExpressionAttributeValues: { ':f': feedbackId },
  }));
  for (const c of comments.Items ?? []) {
    await ddb.send(new DeleteCommand({ TableName: COMMENTS_TABLE, Key: { feedbackId, sk: c.sk } }));
  }
}

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
