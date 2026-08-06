import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { emailDelloStaff } from './staff-emails';

const cognito = mockClient(CognitoIdentityProviderClient);

const utente = (email: string, verificata = true) => ({
  Attributes: [
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: String(verificata) },
  ],
});

/** Chi appartiene a quale gruppo, secondo la richiesta ricevuta. */
function gruppi(per: Record<string, ReturnType<typeof utente>[]>) {
  cognito.on(ListUsersInGroupCommand).callsFake((input) => ({
    Users: per[input.GroupName as string] ?? [],
  }));
}

/**
 * Destinatari degli avvisi allo staff.
 *
 * Prima erano un unico indirizzo fisso in configurazione: quando è stato
 * aggiunto un secondo amministratore, le richieste di registrazione hanno
 * continuato ad arrivare solo al primo — chi poteva approvare non sapeva che
 * c'era da approvare.
 */
describe('emailDelloStaff', () => {
  beforeEach(() => cognito.reset());

  it('scrive a TUTTI, non solo al primo', async () => {
    gruppi({ admin: [utente('uno@example.com'), utente('due@example.com')] });

    expect((await emailDelloStaff(cognito as any, 'pool', 'ripiego@example.com')).sort()).toEqual([
      'due@example.com',
      'uno@example.com',
    ]);
  });

  it('include i `membro`, non solo gli `admin`', async () => {
    // Entrambi i gruppi possono approvare e moderare: avvisare solo una parte di
    // chi può agire ricrea esattamente il buco che stiamo chiudendo.
    gruppi({ admin: [utente('capo@example.com')], membro: [utente('aiuto@example.com')] });

    expect((await emailDelloStaff(cognito as any, 'pool', 'ripiego@example.com')).sort()).toEqual([
      'aiuto@example.com',
      'capo@example.com',
    ]);
  });

  it('non manda due volte a chi è in entrambi i gruppi', async () => {
    gruppi({ admin: [utente('capo@example.com')], membro: [utente('CAPO@example.com')] });

    expect(await emailDelloStaff(cognito as any, 'pool', 'ripiego@example.com')).toEqual([
      'capo@example.com',
    ]);
  });

  it('salta gli indirizzi non verificati: non riceverebbero', async () => {
    gruppi({ admin: [utente('vero@example.com'), utente('mai-confermato@example.com', false)] });

    expect(await emailDelloStaff(cognito as any, 'pool', 'ripiego@example.com')).toEqual([
      'vero@example.com',
    ]);
  });

  it('legge OLTRE la prima pagina', async () => {
    // Con `MaxResults` di default Cognito pagina a 60: fermarsi alla prima
    // pagina significherebbe smettere di avvisare qualcuno in silenzio.
    cognito
      .on(ListUsersInGroupCommand, { GroupName: 'admin' })
      .resolvesOnce({ Users: [utente('pagina1@example.com')], NextToken: 'avanti' })
      .resolvesOnce({ Users: [utente('pagina2@example.com')] })
      .on(ListUsersInGroupCommand, { GroupName: 'membro' })
      .resolves({ Users: [] });

    expect((await emailDelloStaff(cognito as any, 'pool', 'ripiego@example.com')).sort()).toEqual([
      'pagina1@example.com',
      'pagina2@example.com',
    ]);
  });

  describe('quando non si può sapere chi è lo staff', () => {
    it('usa l\'indirizzo di configurazione se Cognito non risponde', async () => {
      // Un avviso in meno è peggio di un avviso a un destinatario in più: non
      // deve smettere di partire in silenzio.
      vi.spyOn(console, 'error').mockImplementation(() => {});
      cognito.on(ListUsersInGroupCommand).rejects(new Error('boom'));

      expect(await emailDelloStaff(cognito as any, 'pool', 'ripiego@example.com')).toEqual([
        'ripiego@example.com',
      ]);
    });

    it('usa l\'indirizzo di configurazione se i gruppi sono vuoti', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      gruppi({});

      expect(await emailDelloStaff(cognito as any, 'pool', 'ripiego@example.com')).toEqual([
        'ripiego@example.com',
      ]);
    });

    it('restituisce una lista vuota se non c\'è nemmeno il ripiego', async () => {
      // Meglio nessun invio che un invio a `undefined`, che SES rifiuta.
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      gruppi({});

      expect(await emailDelloStaff(cognito as any, 'pool', '')).toEqual([]);
    });
  });
});
