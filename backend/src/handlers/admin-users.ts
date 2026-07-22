import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID as string;
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
    // Insieme degli utenti già in un gruppo (= approvati/staff).
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
