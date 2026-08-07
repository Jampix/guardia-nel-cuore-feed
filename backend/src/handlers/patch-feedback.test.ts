import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { handler } from './patch-feedback';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const cognito = mockClient(CognitoIdentityProviderClient);

const staff = { sub: 'admin-1', 'cognito:groups': 'admin' };
const cittadino = { sub: 'user-1', 'cognito:groups': 'cittadino' };

/** Proposta di partenza: privata, appena arrivata, senza risposta. */
const PRIMA = {
  id: 'f1',
  titolo: 'Pista ciclabile',
  autoreId: 'user-1',
  autoreNick: 'Mario',
  stato: 'proposta',
  visibilita: 'privato',
};

/** Prepara il "prima" e il "dopo" della stessa proposta. */
function scenario(prima: Record<string, unknown>, dopo: Record<string, unknown>) {
  ddb.on(GetCommand).resolves({ Item: prima });
  ddb.on(UpdateCommand).resolves({ Attributes: { ...prima, ...dopo } });
}

/** L'email inviata, o `undefined` se non è partita. */
function emailInviata() {
  const call = ses.commandCalls(SendEmailCommand)[0];
  if (!call) return undefined;
  const content = call.args[0].input.Content?.Simple;
  return { oggetto: content?.Subject?.Data ?? '', testo: content?.Body?.Text?.Data ?? '' };
}

beforeEach(() => {
  ddb.reset(); ses.reset(); cognito.reset();
  ses.on(SendEmailCommand).resolves({});
  cognito.on(AdminGetUserCommand).resolves({ UserAttributes: [{ Name: 'email', Value: 'a@b.it' }] });
});

describe('patch-feedback', () => {
  it('403 se il chiamante non è staff', async () => {
    const { status } = parseResult(await handler(apiEvent({
      method: 'PATCH', claims: cittadino, pathParameters: { id: 'f1' }, body: { stato: 'risolto' },
    })));
    expect(status).toBe(403);
    expect(ddb.commandCalls(UpdateCommand).length).toBe(0);
  });

  it('lo staff aggiorna stato e visibilità', async () => {
    scenario(PRIMA, { stato: 'in_lavorazione', visibilita: 'pubblico' });
    const { status, body } = parseResult(await handler(apiEvent({
      method: 'PATCH', claims: staff, pathParameters: { id: 'f1' }, body: { stato: 'in_lavorazione', visibilita: 'pubblico' },
    })));
    expect(status).toBe(200);
    expect(body.visibilita).toBe('pubblico');
    const expr = ddb.commandCalls(UpdateCommand)[0].args[0].input.UpdateExpression as string;
    expect(expr).toContain('visibilita');
  });

  it('404 se la proposta non esiste', async () => {
    ddb.on(GetCommand).resolves({});
    const { status } = parseResult(await handler(apiEvent({
      method: 'PATCH', claims: staff, pathParameters: { id: 'inesistente' }, body: { rispostaPubblica: 'ok' },
    })));
    expect(status).toBe(404);
    expect(ddb.commandCalls(UpdateCommand).length).toBe(0);
  });

  describe('quando avvisare l\'autore', () => {
    it('avvisa al cambio di stato, con la frase di quello stato', async () => {
      scenario(PRIMA, { stato: 'in_lavorazione' });
      await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' }, body: { stato: 'in_lavorazione' },
      }));

      const mail = emailInviata();
      expect(mail?.oggetto).toBe('La tua proposta è stata presa in carico');
      expect(mail?.testo).toContain('Ci stiamo lavorando');
      expect(mail?.testo).toContain('Pista ciclabile');
      expect(mail?.testo).toContain('Ciao Mario');
    });

    it('l\'avviso si può rispondere: porta il Reply-To dell\'associazione', async () => {
      // Il mittente è `noreply@`, che non è una casella. Chi legge «la tua
      // proposta è in lavorazione» e vuole aggiungere un dettaglio premerà
      // Rispondi: senza questo campo scriverebbe nel vuoto senza saperlo.
      scenario(PRIMA, { stato: 'in_lavorazione' });
      await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' }, body: { stato: 'in_lavorazione' },
      }));

      const input = ses.commandCalls(SendEmailCommand)[0]?.args[0].input;
      expect(input?.ReplyToAddresses).toEqual(['guardianelcuore@example.com']);
      expect(input?.FromEmailAddress).not.toEqual(input?.ReplyToAddresses?.[0]);
    });

    it('usa un testo garbato per l\'archiviazione, non l\'etichetta secca', async () => {
      scenario(PRIMA, { stato: 'archiviato' });
      await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' }, body: { stato: 'archiviato' },
      }));

      const mail = emailInviata();
      expect(mail?.testo).toContain('Grazie comunque');
      expect(mail?.oggetto).not.toContain('Archiviato');
    });

    it('avvisa quando la proposta viene pubblicata in bacheca', async () => {
      // Prima non partiva nulla: il cittadino non sapeva di essere in bacheca.
      scenario(PRIMA, { visibilita: 'pubblico' });
      await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' }, body: { visibilita: 'pubblico' },
      }));

      expect(emailInviata()?.oggetto).toBe('La tua proposta è stata pubblicata in bacheca');
    });

    it('avvisa quando arriva una risposta pubblica, anche senza cambio di stato', async () => {
      // Il buco più grave di prima: la risposta è la comunicazione che conta.
      scenario(PRIMA, { rispostaPubblica: 'Grazie, la valuteremo in consiglio.' });
      await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' },
        body: { rispostaPubblica: 'Grazie, la valuteremo in consiglio.' },
      }));

      const mail = emailInviata();
      expect(mail?.oggetto).toBe('Hai una risposta alla tua proposta');
      // La risposta viaggia DENTRO l'email, senza obbligare ad accedere.
      expect(mail?.testo).toContain('la valuteremo in consiglio');
    });

    it('lo staff può correggere titolo e descrizione, e l\'autore viene avvisato', async () => {
      // Prima non poteva farlo NESSUNO: un refuso in una proposta pubblicata era
      // incorreggibile e l'unica via era eliminare tutto.
      scenario(PRIMA, { titolo: 'Pista ciclabile (corretto)' });
      const { status } = parseResult(await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' },
        body: { titolo: 'Pista ciclabile (corretto)' },
      })));

      expect(status).toBe(200);
      expect(emailInviata()?.oggetto).toBe('Il testo della tua proposta è stato corretto');
    });

    it('il cambio di stato prevale sull\'avviso di correzione', async () => {
      scenario(PRIMA, { stato: 'risolto', titolo: 'Ritoccato' });
      await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' },
        body: { stato: 'risolto', titolo: 'Ritoccato' },
      }));

      expect(emailInviata()?.oggetto).toBe('La tua proposta è stata risolta');
    });

    it('rifiuta un titolo vuoto o troppo lungo', async () => {
      for (const titolo of ['', '   ', 'x'.repeat(121)]) {
        ddb.reset(); ses.reset();
        ses.on(SendEmailCommand).resolves({});
        cognito.on(AdminGetUserCommand).resolves({ UserAttributes: [{ Name: 'email', Value: 'a@b.it' }] });
        scenario(PRIMA, {});
        const { status } = parseResult(await handler(apiEvent({
          method: 'PATCH', claims: staff, pathParameters: { id: 'f1' }, body: { titolo },
        })));
        expect(status, JSON.stringify(titolo)).toBe(400);
      }
    });

    it('NON avvisa per la sola nota interna', async () => {
      scenario(PRIMA, { notaInterna: 'Sentire l\'ufficio tecnico' });
      await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' }, body: { notaInterna: 'Sentire l\'ufficio tecnico' },
      }));

      expect(emailInviata()).toBeUndefined();
    });

    it('NON avvisa se si salva senza cambiare nulla', async () => {
      // La schermata di moderazione invia TUTTI i campi a ogni salvataggio:
      // senza il confronto col valore precedente si spedirebbe un'email a vuoto.
      const attuale = { ...PRIMA, stato: 'in_lavorazione', visibilita: 'pubblico', rispostaPubblica: 'Ci pensiamo noi.' };
      scenario(attuale, {});
      await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' },
        body: { stato: 'in_lavorazione', visibilita: 'pubblico', rispostaPubblica: 'Ci pensiamo noi.', notaInterna: 'x' },
      }));

      expect(emailInviata()).toBeUndefined();
    });

    it('NON avvisa quando una proposta viene ri-nascosta', async () => {
      // Nascondere è un'azione di moderazione: decide lo staff se scrivere.
      scenario({ ...PRIMA, visibilita: 'pubblico' }, { visibilita: 'privato' });
      await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' }, body: { visibilita: 'privato' },
      }));

      expect(emailInviata()).toBeUndefined();
    });

    it('un errore di invio non fa fallire la moderazione', async () => {
      scenario(PRIMA, { stato: 'risolto' });
      ses.on(SendEmailCommand).rejects(new Error('SES giù'));
      const { status } = parseResult(await handler(apiEvent({
        method: 'PATCH', claims: staff, pathParameters: { id: 'f1' }, body: { stato: 'risolto' },
      })));

      expect(status).toBe(200);
    });
  });
});
