import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { emailDelloStaff } from '../lib/staff-emails';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({});
const cognito = new CognitoIdentityProviderClient({});
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE as string;
const FROM_EMAIL = process.env.FROM_EMAIL as string;
const STAFF_EMAIL = process.env.STAFF_EMAIL as string;
const USER_POOL_ID = process.env.USER_POOL_ID as string;
const ADMIN_URL = process.env.ADMIN_URL as string;

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
      // Nessun avviso allo staff: premere due volte non deve moltiplicare le email.
      return resp(200, { reported: true });
    }
    throw e;
  }

  // Avvisa lo staff: prima una segnalazione si notava solo aprendo il
  // backoffice, quindi un contenuto offensivo poteva restare in bacheca per
  // giorni. Best-effort: un errore di invio non fa fallire la segnalazione.
  await avvisaStaff(feedbackId, motivo).catch((err) =>
    console.error('Avviso segnalazione non inviato:', err),
  );

  return resp(200, { reported: true });
};

/** Email allo staff con titolo, motivo e link diretto alla moderazione. */
async function avvisaStaff(feedbackId: string, motivo: string): Promise<void> {
  if (!FROM_EMAIL) {
    console.warn('Avviso segnalazione non inviato: mittente non configurato');
    return;
  }
  const destinatari = await emailDelloStaff(cognito, USER_POOL_ID, STAFF_EMAIL);
  if (!destinatari.length) {
    console.warn('Avviso segnalazione non inviato: nessun destinatario');
    return;
  }

  // Titolo e conteggio servono a decidere in fretta: la transazione non li
  // restituisce, quindi si rileggono dopo.
  const item = (
    await ddb.send(new GetCommand({ TableName: FEEDBACKS_TABLE, Key: { id: feedbackId } }))
  ).Item;
  const titolo = String(item?.titolo ?? '(titolo non disponibile)');
  const totale = Number(item?.segnalazioni ?? 1);
  const link = ADMIN_URL ? `${ADMIN_URL}/feedback/${feedbackId}` : '';

  const text =
    `Una proposta è stata segnalata da un cittadino.\n\n` +
    `«${titolo}»\n` +
    `Segnalazioni totali: ${totale}\n` +
    (motivo ? `Motivo indicato: ${motivo}\n` : 'Nessun motivo indicato.\n') +
    (link ? `\nVerifica qui: ${link}` : '') +
    '\n\nGuardia nel Cuore';

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      Destination: { ToAddresses: destinatari },
      Content: {
        Simple: {
          Subject: { Data: `Proposta segnalata — ${titolo}`.slice(0, 200) },
          Body: { Text: { Data: text } },
        },
      },
    }),
  );
  console.log('Avviso segnalazione inviato', { feedbackId, totale });
}

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
