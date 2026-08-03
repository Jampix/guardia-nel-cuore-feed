import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

/**
 * Un solo messaggio, con una frase per stato invece di un generico "il tuo
 * feedback è stato aggiornato": così il cittadino sa cosa è cambiato senza
 * dover accedere, e su «Archiviato» possiamo chiudere con garbo invece di
 * recapitare un'etichetta secca che suona come un rifiuto.
 */
type Avviso = { oggetto: string; frase: string };

const AVVISO_STATO: Record<string, Avviso> = {
  proposta: {
    oggetto: 'Abbiamo ricevuto la tua proposta',
    frase: 'È in attesa di essere esaminata dallo staff.',
  },
  in_valutazione: {
    oggetto: 'La tua proposta è in valutazione',
    frase: 'La stiamo esaminando: ti aggiorniamo appena c\'è una novità.',
  },
  in_lavorazione: {
    oggetto: 'La tua proposta è stata presa in carico',
    frase: 'Ci stiamo lavorando.',
  },
  risolto: {
    oggetto: 'La tua proposta è stata risolta',
    frase: 'L\'abbiamo portata a termine: grazie per averla segnalata.',
  },
  archiviato: {
    oggetto: 'Aggiornamento sulla tua proposta',
    frase:
      'Per ora la mettiamo da parte. Grazie comunque per il contributo: ' +
      'resta consultabile fra le tue proposte.',
  },
};

const AVVISO_PUBBLICATA: Avviso = {
  oggetto: 'La tua proposta è stata pubblicata in bacheca',
  frase: 'Ora è visibile agli altri cittadini, che possono sostenerla.',
};

const AVVISO_RISPOSTA: Avviso = {
  oggetto: 'Hai una risposta alla tua proposta',
  frase: 'L\'associazione ti ha risposto.',
};

/**
 * PATCH /admin/feedback/{id} — moderazione (staff). Aggiorna in modo parziale
 * `stato`, `visibilita`, `rispostaPubblica` (visibile ai cittadini) e
 * `notaInterna` (solo staff). Avvisa l'autore per email quando cambia qualcosa
 * che lui può vedere — stato, pubblicazione in bacheca, risposta — e mai per la
 * sola nota interna. Invio best-effort: un errore non fa fallire la richiesta.
 * Controllo gruppo admin/membro.
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

  // Stato PRECEDENTE: la schermata di moderazione invia tutti i campi a ogni
  // salvataggio, quindi "campo presente nel body" non dice se è cambiato. Senza
  // questo confronto partirebbe un'email a ogni salvataggio, anche a vuoto.
  const prima = (
    await ddb.send(new GetCommand({ TableName: FEEDBACKS_TABLE, Key: { id } }))
  ).Item;
  if (!prima) return resp(404, { message: 'Feedback non trovato' });

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

  // Notifica l'autore (best-effort: un errore di invio non fa fallire la
  // moderazione). Si avvisa per ciò che il cittadino può vedere: cambio di
  // stato, pubblicazione in bacheca, risposta dell'associazione. NON per la
  // nota interna, e NON quando una proposta viene ri-nascosta: in quel caso
  // decide lo staff se e cosa scrivere.
  const avviso = motivoAvviso(prima, item);
  if (avviso) {
    await notifyAuthor(item, avviso).catch((err) => console.error('Invio email fallito:', err));
  }

  return resp(200, item);
};

/** Perché avvisare l'autore, o `null` se non è cambiato nulla di visibile. */
function motivoAvviso(
  prima: Record<string, any>,
  dopo: Record<string, any>,
): Avviso | null {
  if (prima.stato !== dopo.stato) {
    return AVVISO_STATO[String(dopo.stato)] ?? null;
  }
  if (prima.visibilita !== 'pubblico' && dopo.visibilita === 'pubblico') {
    return AVVISO_PUBBLICATA;
  }
  const rispostaPrima = String(prima.rispostaPubblica ?? '').trim();
  const rispostaDopo = String(dopo.rispostaPubblica ?? '').trim();
  if (rispostaDopo && rispostaDopo !== rispostaPrima) {
    return AVVISO_RISPOSTA;
  }
  return null;
}

async function notifyAuthor(item: Record<string, any>, avviso: Avviso): Promise<void> {
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
  const nick = String(item.autoreNick ?? '').trim();
  const link = CLIENT_URL ? `${CLIENT_URL}/feedback/${item.id}` : '';
  const risposta = String(item.rispostaPubblica ?? '').trim();

  // La risposta va DENTRO l'email: è ciò che la persona vuole leggere, e
  // riceverla senza dover accedere è il punto della notifica.
  const text =
    `Ciao${nick ? ' ' + nick : ''},\n\n` +
    `${avviso.frase}\n\n` +
    `«${titolo}»` +
    (risposta ? `\n\nRisposta dell'associazione:\n${risposta}` : '') +
    (link ? `\n\nVedi il dettaglio: ${link}` : '') +
    `\n\nGrazie per il tuo contributo,\nGuardia nel Cuore`;

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: avviso.oggetto },
          Body: { Text: { Data: text } },
        },
      },
    }),
  );

  // Traccia anche gli invii RIUSCITI: senza questo, nei log si vedono solo i
  // fallimenti e non si può verificare che un avviso sia partito. Nessun dato
  // personale: id della proposta e motivo, non l'indirizzo.
  console.log('Avviso inviato', { feedbackId: item.id, motivo: avviso.oggetto });
}

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
