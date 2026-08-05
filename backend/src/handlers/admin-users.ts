import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { UserType } from '@aws-sdk/client-cognito-identity-provider';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESv2Client({});
const USER_POOL_ID = process.env.USER_POOL_ID as string;
const FROM_EMAIL = process.env.FROM_EMAIL as string;
const CLIENT_URL = process.env.CLIENT_URL as string;
const GROUPS = ['admin', 'membro', 'cittadino'];

/**
 * /admin/users — gestione iscrizioni (staff). GET /admin/users/pending lista i
 * cittadini registrati e confermati ma non ancora approvati (in nessun gruppo);
 * POST /admin/users/{username}/approve li aggiunge al gruppo `cittadino`;
 * DELETE /admin/users/{username} rifiuta (elimina l'account).
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
    await cognito.send(
      new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
    );
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
