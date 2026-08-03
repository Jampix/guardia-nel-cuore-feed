import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { handler } from './post-confirmation';

const ses = mockClient(SESv2Client);

function evento(over: Record<string, unknown> = {}) {
  return {
    triggerSource: 'PostConfirmation_ConfirmSignUp',
    request: { userAttributes: { email: 'mario@example.com', nickname: 'Mario' } },
    ...over,
  } as any;
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
  ses.on(SendEmailCommand).resolves({});
});

describe('post-confirmation', () => {
  it('avvisa lo staff e conferma al cittadino', async () => {
    await handler(evento());

    expect(destinatari().sort()).toEqual(['mario@example.com', 'staff@example.com']);
    expect(oggetti()).toContain('Nuova iscrizione da approvare');
    expect(oggetti()).toContain('Registrazione ricevuta — Guardia nel Cuore');
  });

  it('nell\'avviso allo staff mette nome ed email di chi attende', async () => {
    await handler(evento());

    const staffMail = ses
      .commandCalls(SendEmailCommand)
      .find((c) => (c.args[0].input.Destination?.ToAddresses ?? []).includes('staff@example.com'));
    const testo = staffMail?.args[0].input.Content?.Simple?.Body?.Text?.Data ?? '';
    expect(testo).toContain('Mario');
    expect(testo).toContain('mario@example.com');
    expect(testo).toContain('attende');
  });

  it('dice al cittadino di attendere, senza chiedergli altro', async () => {
    await handler(evento());

    const suo = ses
      .commandCalls(SendEmailCommand)
      .find((c) => (c.args[0].input.Destination?.ToAddresses ?? []).includes('mario@example.com'));
    const testo = suo?.args[0].input.Content?.Simple?.Body?.Text?.Data ?? '';
    expect(testo).toContain('approvare');
    expect(testo).toContain('non serve che tu faccia altro');
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
