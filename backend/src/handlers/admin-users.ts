import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
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
      const r = await cognito.send(
        new ListUsersInGroupCommand({ UserPoolId: USER_POOL_ID, GroupName: 'cittadino' }),
      );
      const citizens = (r.Users ?? []).map((u) => ({
        username: u.Username,
        email: attr(u.Attributes, 'email'),
        nickname: attr(u.Attributes, 'nickname'),
        createdAt: u.UserCreateDate?.toISOString(),
        enabled: u.Enabled ?? true,
      }));
      return resp(200, citizens);
    }

    // GET /admin/users/pending → confermati ma non in alcun gruppo.
    const approved = new Set<string>();
    for (const g of GROUPS) {
      const r = await cognito.send(
        new ListUsersInGroupCommand({ UserPoolId: USER_POOL_ID, GroupName: g }),
      );
      for (const u of r.Users ?? []) if (u.Username) approved.add(u.Username);
    }

    const all = await cognito.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID }));
    const pending = (all.Users ?? [])
      .filter((u) => u.UserStatus === 'CONFIRMED' && u.Username && !approved.has(u.Username))
      .map((u) => ({
        username: u.Username,
        email: attr(u.Attributes, 'email'),
        nickname: attr(u.Attributes, 'nickname'),
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

/** Invia al cittadino l'email di benvenuto dopo l'approvazione. */
async function notifyApproved(username: string): Promise<void> {
  if (!FROM_EMAIL) return;
  const user = await cognito.send(
    new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
  );
  const email = attr(user.UserAttributes, 'email');
  const nickname = attr(user.UserAttributes, 'nickname');
  if (!email) return;

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
