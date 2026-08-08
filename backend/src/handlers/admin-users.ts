import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { cancellaDatiUtente } from '../lib/cancella-dati-utente';
import { rispondiA } from '../lib/email';
import type { UserType } from '@aws-sdk/client-cognito-identity-provider';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESv2Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const USER_POOL_ID = process.env.USER_POOL_ID as string;
const FROM_EMAIL = process.env.FROM_EMAIL as string;
const CLIENT_URL = process.env.CLIENT_URL as string;
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const VOTES_TABLE = process.env.VOTES_TABLE as string;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE as string;
const PHOTO_BUCKET = process.env.PHOTO_BUCKET as string;
const GROUPS = ['admin', 'membro', 'cittadino'];

/**
 * /admin/users — gestione delle persone (staff). Quattro operazioni:
 *
 * - `GET /admin/users` → cittadini attivi; `GET /admin/users/pending` → confermati
 *   ma in nessun gruppo, cioè **non attivi** (l'attivazione ormai è automatica:
 *   chi compare lì è stato rimosso, o la sua attivazione non è riuscita);
 * - `POST /admin/users/{username}/approve` → lo (ri)abilita, aggiungendolo al
 *   gruppo `cittadino`;
 * - `POST /admin/users/{username}/revoke` → **toglie l'accesso** rimuovendolo dal
 *   gruppo, senza cancellare nulla. È l'operazione giusta nella gran parte dei
 *   casi: se una sua proposta è già in bacheca e altri l'hanno sostenuta, farla
 *   sparire punirebbe anche loro. ⚠️ Chiude anche le **sessioni aperte**: vedi
 *   sotto, senza quello la rimozione non avrebbe effetto per giorni;
 * - `DELETE /admin/users/{username}` → **rimozione completa**, con la pulizia dei
 *   dati. ⚠️ Fino all'8 agosto 2026 questa rotta eseguiva solo `AdminDeleteUser`,
 *   quindi lasciava orfani proposte, foto, voti e segnalazioni — lo stesso difetto
 *   di cancellare l'utente dalla console Cognito. Ora usa la stessa pulizia del
 *   diritto all'oblio (`lib/cancella-dati-utente.ts`).
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  if (!/\b(admin|membro)\b/.test(String(claims['cognito:groups'] ?? ''))) {
    return resp(403, { message: 'Accesso riservato allo staff.' });
  }

  const method = event.requestContext.http.method;
  const username = event.pathParameters?.username;

  if (method === 'GET') {
    // GET /admin/users → cittadini attivi (gruppo `cittadino`).
    if (!(event.rawPath ?? '').endsWith('/pending')) {
      const citizens = (await tuttiNelGruppo('cittadino')).map((u) => ({
        username: u.Username,
        email: attr(u.Attributes, 'email'),
        nickname: attr(u.Attributes, 'nickname'),
        // Vuoti per i primi iscritti, che si sono registrati prima di questi
        // campi: il frontend deve reggere l'assenza, non nasconderla.
        nome: attr(u.Attributes, 'given_name'),
        cognome: attr(u.Attributes, 'family_name'),
        tipoUtente: attr(u.Attributes, 'custom:tipoUtente'),
        createdAt: u.UserCreateDate?.toISOString(),
        enabled: u.Enabled ?? true,
      }));
      return resp(200, citizens);
    }

    // GET /admin/users/pending → confermati ma non in alcun gruppo.
    const approved = new Set<string>();
    for (const g of GROUPS) {
      for (const u of await tuttiNelGruppo(g)) if (u.Username) approved.add(u.Username);
    }

    const pending = (await tuttiGliUtenti())
      .filter((u) => u.UserStatus === 'CONFIRMED' && u.Username && !approved.has(u.Username))
      .map((u) => ({
        username: u.Username,
        email: attr(u.Attributes, 'email'),
        nickname: attr(u.Attributes, 'nickname'),
        nome: attr(u.Attributes, 'given_name'),
        cognome: attr(u.Attributes, 'family_name'),
        // Serve a decidere l'approvazione: un residente e un turista non hanno
        // lo stesso peso su una proposta che riguarda il paese.
        tipoUtente: attr(u.Attributes, 'custom:tipoUtente'),
        createdAt: u.UserCreateDate?.toISOString(),
      }));
    return resp(200, pending);
  }

  // Due rotte POST sullo stesso parametro: si distinguono dal path, come le GET.
  if (method === 'POST' && username && (event.rawPath ?? '').endsWith('/revoke')) {
    // Prima il gruppo: è lo stato autoritativo, ed è ciò che il gate di login
    // controlla al prossimo accesso.
    await cognito.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        GroupName: 'cittadino',
      }),
    );

    /**
     * ⚠️ Poi le sessioni aperte, e non è un extra: senza questo la rimozione non
     * avrebbe effetto per giorni.
     *
     * Il trigger Pre-Authentication scatta **solo al login con password**, non sul
     * rinnovo del token. Chi è già dentro continua con il token corrente (60
     * minuti) e — soprattutto — Amplify lo rinnova da sé, in silenzio, senza
     * passare dal gate: il token di rinnovo dura **30 giorni**. Nemmeno il logout
     * servirebbe, perché non ha motivo di farlo.
     *
     * `AdminUserGlobalSignOut` invalida subito tutti i token di rinnovo: il primo
     * tentativo fallisce e la persona esce. Resta solo la coda del token che ha
     * già in mano, al massimo un'ora — azzerarla richiederebbe un controllo dei
     * gruppi a ogni chiamata dell'API, che è un altro lavoro.
     */
    let sessioniChiuse = true;
    try {
      await cognito.send(
        new AdminUserGlobalSignOutCommand({ UserPoolId: USER_POOL_ID, Username: username }),
      );
    } catch (err) {
      // NON si ingoia: se le sessioni restano aperte lo staff deve saperlo,
      // altrimenti crede di aver escluso qualcuno che invece continua a navigare.
      console.error('SESSIONI NON CHIUSE: la persona può restare dentro fino a 30 giorni', err);
      sessioniChiuse = false;
    }

    console.log('Accesso rimosso a un cittadino (dati conservati)', { sessioniChiuse });
    return resp(200, { revoked: true, sessioniChiuse });
  }

  if (method === 'POST' && username) {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        GroupName: 'cittadino',
      }),
    );
    // Email di benvenuto (best-effort: non fa fallire l'approvazione).
    await notifyApproved(username).catch((err) => console.error('Email approvazione fallita:', err));
    return resp(200, { approved: true });
  }

  if (method === 'DELETE' && username) {
    // L'identificativo con cui i dati sono salvati è il `sub`, che si LEGGE da
    // Cognito e non si presume uguale allo username: in questo pool coincidono,
    // ma dedurlo qui significherebbe che il giorno in cui non coincidessero la
    // pulizia non troverebbe nulla — e poi l'utente verrebbe cancellato comunque,
    // lasciando i dati orfani senza un solo errore.
    const utente = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
    );
    const sub = utente.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
    if (!sub) {
      return resp(500, { message: 'Impossibile identificare l\'utente: rimozione annullata.' });
    }

    const rimosso = await cancellaDatiUtente(ddb, s3, sub, {
      feedbacks: FEEDBACKS_TABLE,
      votes: VOTES_TABLE,
      comments: COMMENTS_TABLE,
      photoBucket: PHOTO_BUCKET,
    });

    // Cognito per ultimo: se la pulizia fallisse, l'utente resta e si sa di chi
    // erano i dati.
    await cognito.send(
      new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
    );
    console.log('Persona rimossa dallo staff, con pulizia dei dati', rimosso);
    return resp(204, null);
  }

  return resp(400, { message: 'Richiesta non valida' });
};

/**
 * Cognito restituisce al massimo 60 utenti per pagina. Senza seguire il token
 * di paginazione, oltre quella soglia l'insieme degli approvati sarebbe
 * incompleto: i gia' approvati ricomparirebbero fra quelli "in attesa" e altri
 * sparirebbero dalla lista senza che nessuno se ne accorga — lo stesso tipo di
 * guasto silenzioso che ha gia' lasciato dei cittadini in attesa per giorni.
 *
 * ⚠️ Le due API usano nomi diversi per il token: `NextToken` per
 * ListUsersInGroup, `PaginationToken` per ListUsers.
 */
async function tuttiNelGruppo(gruppo: string): Promise<UserType[]> {
  const out: UserType[] = [];
  let token: string | undefined;
  do {
    const r = await cognito.send(new ListUsersInGroupCommand({
      UserPoolId: USER_POOL_ID,
      GroupName: gruppo,
      NextToken: token,
    }));
    out.push(...(r.Users ?? []));
    token = r.NextToken;
  } while (token);
  return out;
}

async function tuttiGliUtenti(): Promise<UserType[]> {
  const out: UserType[] = [];
  let token: string | undefined;
  do {
    const r = await cognito.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      PaginationToken: token,
    }));
    out.push(...(r.Users ?? []));
    token = r.PaginationToken;
  } while (token);
  return out;
}

/** Invia al cittadino l'email di benvenuto dopo l'approvazione. */
async function notifyApproved(username: string): Promise<void> {
  // Le due uscite qui sotto erano SILENZIOSE: se non si inviava per mancanza
  // di configurazione o di indirizzo, nei log non restava nulla e sembrava che
  // l'email fosse partita. Ora ogni esito lascia traccia.
  if (!FROM_EMAIL) {
    console.warn('Email approvazione non inviata: FROM_EMAIL non configurato');
    return;
  }
  const user = await cognito.send(
    new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
  );
  const email = attr(user.UserAttributes, 'email');
  const nickname = attr(user.UserAttributes, 'nickname');
  if (!email) {
    console.warn('Email approvazione non inviata: utente senza indirizzo', { username });
    return;
  }

  const link = CLIENT_URL ? `${CLIENT_URL}/accedi` : '';
  const text =
    `Ciao ${nickname || ''},\n\n` +
    'la tua iscrizione a Guardia nel Cuore è stata accettata! ' +
    'Ora puoi accedere con le credenziali che hai scelto in fase di registrazione.' +
    (link ? `\n\nAccedi qui: ${link}` : '') +
    '\n\nA presto,\nGuardia nel Cuore';

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      ReplyToAddresses: rispondiA(),
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: 'La tua iscrizione è stata accettata — Guardia nel Cuore' },
          Body: { Text: { Data: text } },
        },
      },
    }),
  );
  console.log('Email approvazione inviata', { username });
}

function attr(
  attrs: { Name?: string; Value?: string }[] | undefined,
  name: string,
): string {
  return attrs?.find((a) => a.Name === name)?.Value ?? '';
}

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: obj === null ? '' : JSON.stringify(obj),
  };
}
