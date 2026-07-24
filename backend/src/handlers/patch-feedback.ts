import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({});
const cognito = new CognitoIdentityProviderClient({});
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const FROM_EMAIL = process.env.FROM_EMAIL as string;
const USER_POOL_ID = process.env.USER_POOL_ID as string;
const CLIENT_URL = process.env.CLIENT_URL as string;

const STATI = ['proposta', 'in_valutazione', 'in_lavorazione', 'risolto', 'archiviato'];
const STATO_LABEL: Record<string, string> = {
  proposta: 'Proposta',
  in_valutazione: 'In valutazione',
  in_lavorazione: 'In lavorazione',
  risolto: 'Risolto',
  archiviato: 'Archiviato',
};

/**
 * PATCH /admin/feedback/{id} — moderazione (staff). Aggiorna in modo parziale
 * `stato`, `rispostaPubblica` (visibile ai cittadini) e `notaInterna` (solo
 * staff). Al cambio stato invia una email all'autore (best-effort: un errore
 * di invio non fa fallire la richiesta). Controllo gruppo admin/membro.
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

  const statoChanged = body.stato !== undefined;
  if (statoChanged) {
    if (!STATI.includes(String(body.stato))) return resp(400, { message: 'stato non valido' });
    sets.push('#stato = :stato');
    names['#stato'] = 'stato';
    values[':stato'] = String(body.stato);
  }
  if (body.visibilita !== undefined) {
    const vis = body.visibilita === 'pubblico' ? 'pubblico' : 'privato';
    sets.push('visibilita = :vis');
    values[':vis'] = vis;
  }
  if (body.rispostaPubblica !== undefined) {
    sets.push('rispostaPubblica = :rp');
    values[':rp'] = String(body.rispostaPubblica).slice(0, 4000);
  }
  if (body.notaInterna !== undefined) {
    sets.push('notaInterna = :ni');
    values[':ni'] = String(body.notaInterna).slice(0, 4000);
  }

  let item: Record<string, any>;
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
    item = res.Attributes ?? {};
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') {
      return resp(404, { message: 'Feedback non trovato' });
    }
    throw e;
  }

  // Notifica l'autore al cambio stato (best-effort).
  if (statoChanged) {
    await notifyAuthor(item).catch((err) => console.error('Invio email fallito:', err));
  }

  return resp(200, item);
};

async function notifyAuthor(item: Record<string, any>): Promise<void> {
  if (!FROM_EMAIL || !USER_POOL_ID) return;
  const autoreId = String(item.autoreId ?? '');
  if (!autoreId) return;

  // Risolve l'email dell'autore da Cognito (non è salvata sul feedback).
  const user = await cognito.send(
    new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: autoreId }),
  );
  const email = user.UserAttributes?.find((a) => a.Name === 'email')?.Value;
  if (!email) return;

  const titolo = String(item.titolo ?? 'la tua proposta');
  const statoLabel = STATO_LABEL[String(item.stato)] ?? String(item.stato);
  const link = CLIENT_URL ? `${CLIENT_URL}/feedback/${item.id}` : '';
  const risposta = item.rispostaPubblica ? String(item.rispostaPubblica) : '';

  const text =
    `Ciao,\n\nla tua proposta «${titolo}» ha un aggiornamento: stato «${statoLabel}».` +
    (risposta ? `\n\nRisposta dell'associazione:\n${risposta}` : '') +
    (link ? `\n\nVedi il dettaglio: ${link}` : '') +
    `\n\nGrazie per il tuo contributo,\nGuardia nel Cuore`;

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: `Aggiornamento sulla tua proposta — ${statoLabel}` },
          Body: { Text: { Data: text } },
        },
      },
    }),
  );
}

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
