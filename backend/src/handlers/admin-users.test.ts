import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  ListUsersCommand,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { UserType } from '@aws-sdk/client-cognito-identity-provider';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { handler } from './admin-users';
import { apiEvent, parseResult } from './_test-helpers';

const cognito = mockClient(CognitoIdentityProviderClient);
const ses = mockClient(SESv2Client);

const staff = { sub: 'admin-1', 'cognito:groups': 'admin' };
const membro = { sub: 'membro-1', 'cognito:groups': 'membro' };
const cittadino = { sub: 'user-1', 'cognito:groups': 'cittadino' };

/**
 * Gestione iscrizioni (staff). È il flusso che a luglio ha lasciato sei
 * cittadini in attesa: l'approvazione riusciva ma l'email falliva in silenzio.
 * I test fissano sia chi compare fra i pendenti, sia il fatto che un problema
 * di posta non deve far fallire l'approvazione.
 */
function utente(over: Partial<UserType> = {}): UserType {
  return {
    Username: 'u1',
    UserStatus: 'CONFIRMED',
    Attributes: [
      { Name: 'email', Value: 'mario@example.com' },
      { Name: 'nickname', Value: 'Mario' },
    ],
    ...over,
  };
}

function get(rawPath: string, claims: Record<string, unknown> = staff) {
  return handler({ ...apiEvent({ method: 'GET', claims }), rawPath } as any);
}

beforeEach(() => {
  cognito.reset(); ses.reset();
  ses.on(SendEmailCommand).resolves({});
  cognito.on(AdminAddUserToGroupCommand).resolves({});
  cognito.on(AdminDeleteUserCommand).resolves({});
  cognito.on(AdminGetUserCommand).resolves({
    UserAttributes: [
      { Name: 'email', Value: 'mario@example.com' },
      { Name: 'nickname', Value: 'Mario' },
    ],
  });
  cognito.on(ListUsersInGroupCommand).resolves({ Users: [] });
  cognito.on(ListUsersCommand).resolves({ Users: [] });
});

describe('admin-users', () => {
  describe('accesso', () => {
    it('403 per un cittadino', async () => {
      const { status } = parseResult(await get('/admin/users', cittadino));
      expect(status).toBe(403);
      expect(cognito.commandCalls(ListUsersInGroupCommand).length).toBe(0);
    });

    it('403 anche sull\'approvazione, non solo in lettura', async () => {
      const { status } = parseResult(await handler(apiEvent({
        method: 'POST', claims: cittadino, pathParameters: { username: 'u1' },
      })));
      expect(status).toBe(403);
      expect(cognito.commandCalls(AdminAddUserToGroupCommand).length).toBe(0);
    });

    it('consentito al gruppo `membro`, non solo ad `admin`', async () => {
      const { status } = parseResult(await get('/admin/users', membro));
      expect(status).toBe(200);
    });
  });

  describe('elenco cittadini attivi', () => {
    it('restituisce chi è nel gruppo `cittadino`', async () => {
      cognito.on(ListUsersInGroupCommand).resolves({ Users: [utente()] });

      const { status, body } = parseResult(await get('/admin/users'));

      expect(status).toBe(200);
      expect(body[0].email).toBe('mario@example.com');
      expect(body[0].nickname).toBe('Mario');
    });
  });

  describe('elenco in attesa', () => {
    it('mostra i confermati che non sono in alcun gruppo', async () => {
      cognito.on(ListUsersCommand).resolves({ Users: [utente({ Username: 'nuovo' })] });

      const { body } = parseResult(await get('/admin/users/pending'));

      expect(body.length).toBe(1);
      expect(body[0].username).toBe('nuovo');
    });

    it('ESCLUDE chi è già approvato', async () => {
      // È la logica che decide chi vedi in "In attesa": se sbaglia, riapprovi
      // persone già dentro o non vedi chi aspetta.
      cognito.on(ListUsersInGroupCommand).resolves({ Users: [utente({ Username: 'giaDentro' })] });
      cognito.on(ListUsersCommand).resolves({
        Users: [utente({ Username: 'giaDentro' }), utente({ Username: 'nuovo' })],
      });

      const { body } = parseResult(await get('/admin/users/pending'));

      expect(body.map((u: any) => u.username)).toEqual(['nuovo']);
    });

    it('ESCLUDE chi non ha ancora confermato l\'email', async () => {
      // Senza email verificata non c'è nulla da approvare: comparirebbe in
      // lista e l'approvazione non gli servirebbe a entrare.
      cognito.on(ListUsersCommand).resolves({
        Users: [utente({ Username: 'nonConfermato', UserStatus: 'UNCONFIRMED' })],
      });

      const { body } = parseResult(await get('/admin/users/pending'));

      expect(body.length).toBe(0);
    });

    it('legge TUTTE le pagine degli utenti, non solo la prima', async () => {
      // Cognito ne restituisce max 60 per pagina: senza seguire il token, oltre
      // quella soglia dei cittadini in attesa sparirebbero dalla lista.
      cognito.on(ListUsersCommand)
        .resolvesOnce({ Users: [utente({ Username: 'pagina1' })], PaginationToken: 'p2' })
        .resolvesOnce({ Users: [utente({ Username: 'pagina2' })] });

      const { body } = parseResult(await get('/admin/users/pending'));

      expect(body.map((u: any) => u.username).sort()).toEqual(['pagina1', 'pagina2']);
    });

    it('legge tutte le pagine anche dei gruppi (token con nome diverso)', async () => {
      // ListUsersInGroup usa `NextToken`, ListUsers usa `PaginationToken`:
      // sbagliare il nome fa smettere di paginare in silenzio.
      cognito.on(ListUsersInGroupCommand)
        .resolvesOnce({ Users: [utente({ Username: 'c1' })], NextToken: 'g2' })
        .resolvesOnce({ Users: [utente({ Username: 'c2' })] });

      const { body } = parseResult(await get('/admin/users'));

      expect(body.map((u: any) => u.username).sort()).toEqual(['c1', 'c2']);
    });

    it('distingue /pending dall\'elenco degli attivi', async () => {
      await get('/admin/users');
      const soloCittadino = cognito.commandCalls(ListUsersInGroupCommand).length;
      cognito.resetHistory();
      await get('/admin/users/pending');

      // L'elenco attivi interroga un gruppo, i pendenti tutti e tre.
      expect(soloCittadino).toBe(1);
      expect(cognito.commandCalls(ListUsersInGroupCommand).length).toBe(3);
    });
  });

  describe('approvazione', () => {
    it('aggiunge al gruppo `cittadino` e manda l\'email di benvenuto', async () => {
      const { status, body } = parseResult(await handler(apiEvent({
        method: 'POST', claims: staff, pathParameters: { username: 'u1' },
      })));

      expect(status).toBe(200);
      expect(body.approved).toBe(true);
      const add = cognito.commandCalls(AdminAddUserToGroupCommand)[0].args[0].input;
      expect(add.GroupName).toBe('cittadino');
      expect(add.Username).toBe('u1');

      const mail = ses.commandCalls(SendEmailCommand)[0].args[0].input;
      expect(mail.Destination?.ToAddresses).toEqual(['mario@example.com']);
      expect(mail.Content?.Simple?.Body?.Text?.Data).toContain('accettata');
    });

    it('APPROVA anche se l\'email non parte', async () => {
      // È il caso di luglio: SES rifiutava l'invio e l'approvazione riusciva
      // comunque. Il comportamento è corretto — non si blocca la moderazione
      // per un problema di posta — ma va fissato in un test perché l'esito
      // resti visibile nei log invece di passare inosservato.
      ses.on(SendEmailCommand).rejects(new Error('AccessDenied'));

      const { status, body } = parseResult(await handler(apiEvent({
        method: 'POST', claims: staff, pathParameters: { username: 'u1' },
      })));

      expect(status).toBe(200);
      expect(body.approved).toBe(true);
      expect(cognito.commandCalls(AdminAddUserToGroupCommand).length).toBe(1);
    });

    it('non manda nulla se l\'utente non ha un indirizzo', async () => {
      cognito.on(AdminGetUserCommand).resolves({ UserAttributes: [] });

      const { status } = parseResult(await handler(apiEvent({
        method: 'POST', claims: staff, pathParameters: { username: 'u1' },
      })));

      expect(status).toBe(200);
      expect(ses.commandCalls(SendEmailCommand).length).toBe(0);
    });
  });

  describe('rifiuto', () => {
    it('elimina l\'utente e risponde 204', async () => {
      const { status } = parseResult(await handler(apiEvent({
        method: 'DELETE', claims: staff, pathParameters: { username: 'u1' },
      })));

      expect(status).toBe(204);
      expect(cognito.commandCalls(AdminDeleteUserCommand)[0].args[0].input.Username).toBe('u1');
      // Rifiutare non manda email: la persona non deve ricevere un benvenuto.
      expect(ses.commandCalls(SendEmailCommand).length).toBe(0);
    });
  });

  it('400 se manca lo username sulle azioni', async () => {
    const { status } = parseResult(await handler(apiEvent({ method: 'POST', claims: staff })));
    expect(status).toBe(400);
  });
});
