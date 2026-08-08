import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { emailDelloStaff } from '../lib/staff-emails';
import { rispondiA } from '../lib/email';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({});
const cognito = new CognitoIdentityProviderClient({});
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const FROM_EMAIL = process.env.FROM_EMAIL as string;
const STAFF_EMAIL = process.env.STAFF_EMAIL as string;
const USER_POOL_ID = process.env.USER_POOL_ID as string;
const ADMIN_URL = process.env.ADMIN_URL as string;

/**
 * POST /feedback — crea un feedback (richiede autenticazione JWT Cognito).
 *
 * L'autore è ricavato dai claim del token, mai dal body. La proposta nasce
 * **sempre privata**: il valore inviato dal client viene ignorato e solo lo staff
 * può pubblicarla dalla moderazione. Alla creazione parte un avviso allo staff.
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
  // Limiti di lunghezza: evitano di salvare stringhe enormi.
  if (titolo.length > 120) return resp(400, { message: 'titolo troppo lungo (max 120)' });
  if (descrizione.length > 4000) return resp(400, { message: 'descrizione troppo lunga (max 4000)' });
  const luogo = body.luogo ? String(body.luogo).trim().slice(0, 160) : null;

  // Coordinate: accettate solo se numeri validi ed entro i range geografici.
  const lat = coord(body.lat, 90);
  const lng = coord(body.lng, 180);

  const now = new Date().toISOString();
  const item = {
    id: randomUUID(),
    titolo,
    descrizione,
    categoriaId: body.categoriaId ? String(body.categoriaId) : null,
    // Ogni proposta nasce PRIVATA: solo lo staff può renderla pubblica dalla
    // moderazione. Il valore inviato dal client viene ignorato di proposito.
    visibilita: 'privato',
    stato: 'proposta',
    autoreId,
    autoreNick,
    lat,
    lng,
    luogo,
    // Chiave S3 dell'eventuale foto (caricata via presigned PUT). L'URL di
    // lettura viene generato al volo dagli endpoint di lettura.
    fotoKey: body.fotoKey ? String(body.fotoKey) : null,
    numeroVoti: 0,
    lingua: body.lingua === 'en' ? 'en' : 'it',
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: FEEDBACKS_TABLE, Item: item }));

  // Avviso allo staff: senza questo una proposta resta invisibile finché qualcuno
  // non apre il backoffice — e nasce PRIVATA, quindi non la vede nessun altro. È lo
  // stesso buco che a luglio ha lasciato dei cittadini in attesa per giorni.
  // Best-effort: un problema di posta non deve far fallire l'invio di chi ha appena
  // scritto la sua proposta.
  await avvisaStaff().catch((err) => console.error('Avviso nuova proposta fallito:', err));

  return resp(201, item);
};

/**
 * Avvisa lo staff che c'è una proposta da valutare.
 *
 * ⚠️ **Nell'email non finisce NIENTE della proposta**: né titolo, né testo, né il nome
 * di chi l'ha scritta. Scelta esplicita dell'associazione — la proposta è privata in
 * questo momento, e il suo contenuto non deve viaggiare verso le caselle personali
 * dello staff (Gmail, Libero) quando basta un clic per leggerlo nel backoffice, dove è
 * già protetto dall'accesso. C'è un test che lo pretende.
 *
 * Il link punta alle **non pubblicate**, non alla lista intera: un avviso che non dice
 * nulla si impara a ignorarlo, e portare direttamente su cosa c'è da fare è l'unico
 * modo di compensarlo senza rivelare contenuti.
 */
async function avvisaStaff(): Promise<void> {
  if (!FROM_EMAIL || !USER_POOL_ID) return;
  const destinatari = await emailDelloStaff(cognito, USER_POOL_ID, STAFF_EMAIL);
  if (!destinatari.length) return;

  const link = ADMIN_URL ? `${ADMIN_URL}/feedback?vis=private` : '';
  const text =
    'C\'è una nuova proposta in attesa di valutazione.\n\n' +
    'Resta privata — non la vede nessuno — finché non la pubblichi in bacheca.' +
    (link ? `\n\nApri le proposte da valutare: ${link}` : '') +
    '\n\nGuardia nel Cuore';

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      ReplyToAddresses: rispondiA(),
      Destination: { ToAddresses: destinatari },
      Content: {
        Simple: {
          Subject: { Data: 'Nuova proposta da moderare' },
          Body: { Text: { Data: text } },
        },
      },
    }),
  );
  console.log('Avviso nuova proposta inviato allo staff', { destinatari: destinatari.length });
}

/** Coerce a numero e valida entro ±max; altrimenti null (coordinata assente). */
function coord(v: unknown, max: number): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
