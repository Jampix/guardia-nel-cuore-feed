import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESv2Client({});
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const VOTES_TABLE = process.env.VOTES_TABLE as string;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE as string;
const PHOTO_BUCKET = process.env.PHOTO_BUCKET as string;
const FROM_EMAIL = process.env.FROM_EMAIL as string;
const STAFF_EMAIL = process.env.STAFF_EMAIL as string;
const ADMIN_URL = process.env.ADMIN_URL as string;

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
    // Avvisa lo staff PRIMA di cancellare: dopo, titolo e segnalazioni non
    // esisterebbero più. Serve perché eliminare è anche una via di fuga dalla
    // moderazione: chi viene segnalato può far sparire proposta E segnalazioni.
    await avvisaStaffSeRilevante(item).catch((e) =>
      console.error('Avviso eliminazione non inviato:', e),
    );
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
      // Non si suggerisce l'eliminazione: era un invito all'azione distruttiva
      // proprio nel momento in cui la proposta ha già voti e magari una
      // risposta. Si indirizza allo staff, che può correggere o ritirarla.
      return resp(409, {
        message:
          'La proposta è già pubblicata e non è più modificabile: altri cittadini ' +
          'l\'hanno letta e votata così. Per una correzione scrivi allo staff.',
      });
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

/**
 * Avvisa lo staff dell'eliminazione, ma solo se c'era qualcosa da sapere:
 * proposta già pubblicata (altri l'hanno vista e votata) oppure con
 * segnalazioni aperte. Una proposta privata e mai segnalata è affare
 * dell'autore e non serve disturbare nessuno.
 */
async function avvisaStaffSeRilevante(item: Record<string, any>): Promise<void> {
  const pubblicata = item.visibilita === 'pubblico';
  const segnalazioni = Number(item.segnalazioni ?? 0);
  if (!pubblicata && segnalazioni === 0) return;
  if (!FROM_EMAIL || !STAFF_EMAIL) {
    console.warn('Avviso eliminazione non inviato: mittente o destinatario non configurati');
    return;
  }

  const titolo = String(item.titolo ?? '(senza titolo)');
  const voti = Number(item.numeroVoti ?? 0);
  const text =
    `L'autore ha eliminato una sua proposta.\n\n` +
    `«${titolo}»\n` +
    `Era ${pubblicata ? 'PUBBLICATA in bacheca' : 'privata'}.\n` +
    `Sostegni ricevuti: ${voti}\n` +
    `Segnalazioni aperte: ${segnalazioni}\n` +
    (segnalazioni > 0
      ? '\n⚠️ La proposta era segnalata: con l\'eliminazione sono spariti anche i motivi. ' +
        'Se il comportamento si ripete, questo messaggio è l\'unica traccia rimasta.\n'
      : '') +
    (ADMIN_URL ? `\nBackoffice: ${ADMIN_URL}/feedback` : '') +
    '\n\nGuardia nel Cuore';

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      Destination: { ToAddresses: [STAFF_EMAIL] },
      Content: {
        Simple: {
          Subject: { Data: `Proposta eliminata dall'autore — ${titolo}`.slice(0, 200) },
          Body: { Text: { Data: text } },
        },
      },
    }),
  );
  console.log('Avviso eliminazione inviato', { id: item.id, pubblicata, segnalazioni });
}

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
