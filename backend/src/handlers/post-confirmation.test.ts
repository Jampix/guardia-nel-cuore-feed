import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { handler } from './post-confirmation';

const ses = mockClient(SESv2Client);
const cognito = mockClient(CognitoIdentityProviderClient);

/** Staff registrato nei gruppi del pool. */
function staff(...email: string[]) {
  cognito.on(ListUsersInGroupCommand, { GroupName: 'admin' }).resolves({
    Users: email.map((e) => ({
      Attributes: [
        { Name: 'email', Value: e },
        { Name: 'email_verified', Value: 'true' },
      ],
    })),
  });
  cognito.on(ListUsersInGroupCommand, { GroupName: 'membro' }).resolves({ Users: [] });
}

function evento(over: Record<string, unknown> = {}) {
  return {
    triggerSource: 'PostConfirmation_ConfirmSignUp',
    // Il pool arriva dall'evento del trigger, non da una variabile d'ambiente.
    userPoolId: 'eu-west-1_test',
    userName: 'sub-di-mario',
    request: { userAttributes: { email: 'mario@example.com', nickname: 'Mario' } },
    ...over,
  } as any;
}

/** Testo dell'email arrivata a un certo destinatario. */
function testoPer(dest: string): string {
  const call = ses
    .commandCalls(SendEmailCommand)
    .find((c) => (c.args[0].input.Destination?.ToAddresses ?? []).includes(dest));
  return call?.args[0].input.Content?.Simple?.Body?.Text?.Data ?? '';
}

/** Destinatari delle email inviate, nell'ordine in cui sono partite. */
function destinatari(): string[] {
  return ses
    .commandCalls(SendEmailCommand)
    .flatMap((c) => c.args[0].input.Destination?.ToAddresses ?? []);
}

function oggetti(): string[] {
  return ses
    .commandCalls(SendEmailCommand)
    .map((c) => c.args[0].input.Content?.Simple?.Subject?.Data ?? '');
}

beforeEach(() => {
  ses.reset();
  cognito.reset();
  ses.on(SendEmailCommand).resolves({});
  cognito.on(AdminAddUserToGroupCommand).resolves({});
  staff('staff@example.com');
});

describe('post-confirmation', () => {
  it('avvisa lo staff e conferma al cittadino', async () => {
    await handler(evento());

    expect(destinatari().sort()).toEqual(['mario@example.com', 'staff@example.com']);
    expect(oggetti()).toContain('Nuova iscrizione');
    expect(oggetti()).toContain('Benvenuto in Guardia nel Cuore');
  });

  it('avvisa TUTTI gli amministratori, non solo il primo', async () => {
    // Quando è stato aggiunto un secondo amministratore per dare una mano, le
    // richieste di registrazione continuavano ad arrivare solo al primo: chi
    // poteva approvare non sapeva che c'era da approvare.
    staff('primo@example.com', 'secondo@example.com');

    await handler(evento());

    const avviso = ses
      .commandCalls(SendEmailCommand)
      .map((c) => c.args[0].input)
      .find((i) => i.Content?.Simple?.Subject?.Data === 'Nuova iscrizione');
    expect(avviso?.Destination?.ToAddresses?.sort()).toEqual([
      'primo@example.com',
      'secondo@example.com',
    ]);
  });

  it('la conferma al cittadino resta solo al cittadino', async () => {
    // Lo staff non deve ricevere anche la copia destinata a chi si è iscritto.
    staff('primo@example.com', 'secondo@example.com');

    await handler(evento());

    const conferma = ses
      .commandCalls(SendEmailCommand)
      .map((c) => c.args[0].input)
      .find((i) => i.Content?.Simple?.Subject?.Data?.startsWith('Benvenuto'));
    expect(conferma?.Destination?.ToAddresses).toEqual(['mario@example.com']);
  });

  it('nell\'avviso allo staff mette nome ed email di chi si è iscritto', async () => {
    await handler(evento());

    const testo = testoPer('staff@example.com');
    expect(testo).toContain('Mario');
    expect(testo).toContain('mario@example.com');
    // Nessuna azione richiesta: è un avviso, non una coda da smaltire.
    expect(testo).toContain('Non serve fare nulla');
  });

  it('dice al cittadino che può accedere subito', async () => {
    await handler(evento());

    const testo = testoPer('mario@example.com');
    expect(testo).toContain('puoi accedere subito');
    // L'attesa non esiste più: prometterla sarebbe falso.
    expect(testo).not.toMatch(/approv|attend/i);
  });

  describe('attivazione automatica', () => {
    it('aggiunge il nuovo iscritto al gruppo cittadino', async () => {
      // È l'intera modifica: senza questa chiamata la persona resta fuori, e il
      // gate del pre-auth la blocca al primo accesso.
      await handler(evento());

      const call = cognito.commandCalls(AdminAddUserToGroupCommand)[0];
      expect(call, 'nessuna attivazione richiesta').toBeDefined();
      expect(call.args[0].input).toMatchObject({
        UserPoolId: 'eu-west-1_test',
        Username: 'sub-di-mario',
        GroupName: 'cittadino',
      });
    });

    it('se l\'attivazione FALLISCE lo dice allo staff e non promette l\'accesso', async () => {
      // Il guasto peggiore possibile qui è quello silenzioso: confermato ma
      // incapace di entrare, e nessuno lo sa. È già accaduto a luglio.
      cognito.on(AdminAddUserToGroupCommand).rejects(new Error('Cognito giù'));

      await handler(evento());

      const perStaff = testoPer('staff@example.com');
      expect(perStaff).toContain('NON È RIUSCITA');
      expect(perStaff).toContain('Cittadini');
      expect(oggetti().some((o) => /NON attivata/.test(o))).toBe(true);

      const perCittadino = testoPer('mario@example.com');
      expect(perCittadino).not.toContain('puoi accedere subito');
      expect(perCittadino).toContain('ti scriviamo appena è fatto');
    });

    it('restituisce l\'evento anche se l\'attivazione fallisce', async () => {
      cognito.on(AdminAddUserToGroupCommand).rejects(new Error('Cognito giù'));
      const ev = evento();
      await expect(handler(ev)).resolves.toBe(ev);
    });

    it('NON attiva nessuno dopo la conferma di un cambio password', async () => {
      await handler(evento({ triggerSource: 'PostConfirmation_ConfirmForgotPassword' }));
      expect(cognito.commandCalls(AdminAddUserToGroupCommand).length).toBe(0);
    });
  });

  it('nell\'avviso allo staff mette nome vero e rapporto col paese', async () => {
    // Servono a decidere l'approvazione: un residente e un turista non hanno lo
    // stesso peso su una proposta che riguarda il paese.
    await handler(evento({
      request: {
        userAttributes: {
          email: 'mario@example.com',
          nickname: 'Marco P.',
          given_name: 'Mario',
          family_name: 'Rossi',
          'custom:tipoUtente': 'residente',
        },
      },
    }));

    const staffMail = ses
      .commandCalls(SendEmailCommand)
      .find((c) => (c.args[0].input.Destination?.ToAddresses ?? []).includes('staff@example.com'));
    const testo = staffMail?.args[0].input.Content?.Simple?.Body?.Text?.Data ?? '';
    expect(testo).toContain('Mario Rossi');
    expect(testo).toContain('Nome pubblico: Marco P.');
    // L'etichetta in parole, non il codice tecnico.
    expect(testo).toContain('residente a Guardia Piemontese');
    expect(testo).not.toContain('non_residente');
  });

  it('funziona per i primi iscritti, che non hanno quei campi', async () => {
    // I 13 utenti registrati prima non hanno nome, cognome né tipo: l'avviso
    // deve degradare senza righe vuote né "undefined".
    await handler(evento({
      request: { userAttributes: { email: 'vecchio@example.com', nickname: 'Tizio' } },
    }));

    const staffMail = ses
      .commandCalls(SendEmailCommand)
      .find((c) => (c.args[0].input.Destination?.ToAddresses ?? []).includes('staff@example.com'));
    const testo = staffMail?.args[0].input.Content?.Simple?.Body?.Text?.Data ?? '';
    expect(testo).toContain('vecchio@example.com');
    expect(testo).not.toContain('undefined');
    expect(testo).not.toContain('Si dichiara:');
  });

  it('NON invia nulla dopo la conferma di un cambio password', async () => {
    // Lo stesso trigger scatta anche lì: annunciare un'iscrizione sarebbe falso.
    await handler(evento({ triggerSource: 'PostConfirmation_ConfirmForgotPassword' }));

    expect(ses.commandCalls(SendEmailCommand).length).toBe(0);
  });

  it('restituisce sempre l\'evento, anche se l\'invio fallisce', async () => {
    // Se il trigger solleva, chi ha appena inserito il codice GIUSTO vede un
    // errore: l'utente a questo punto è già confermato.
    ses.on(SendEmailCommand).rejects(new Error('SES giù'));
    const ev = evento();

    await expect(handler(ev)).resolves.toBe(ev);
  });

  it('funziona anche senza nickname', async () => {
    await handler(evento({ request: { userAttributes: { email: 'anna@example.com' } } }));

    expect(destinatari()).toContain('anna@example.com');
  });
});
