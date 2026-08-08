import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { handler } from './create-feedback';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const cognito = mockClient(CognitoIdentityProviderClient);
const citizen = { sub: 'user-1', nickname: 'Marco P.' };

/** Corpo dell'avviso partito allo staff, o '' se non è partito nulla. */
function avviso(): string {
  const c = ses.commandCalls(SendEmailCommand)[0];
  return c?.args[0].input.Content?.Simple?.Body?.Text?.Data ?? '';
}

beforeEach(() => {
  ddb.reset(); ses.reset(); cognito.reset();
  ddb.on(PutCommand).resolves({});
  ses.on(SendEmailCommand).resolves({});
  cognito.on(ListUsersInGroupCommand, { GroupName: 'admin' }).resolves({
    Users: [{ Attributes: [
      { Name: 'email', Value: 'staff@example.com' },
      { Name: 'email_verified', Value: 'true' },
    ] }],
  });
  cognito.on(ListUsersInGroupCommand, { GroupName: 'membro' }).resolves({ Users: [] });
});

describe('create-feedback', () => {
  it('rifiuta senza autenticazione (401)', async () => {
    const { status } = parseResult(await handler(apiEvent({ claims: {}, body: { titolo: 'x', descrizione: 'yyyyyyyyyy' } })));
    expect(status).toBe(401);
  });

  it('richiede titolo e descrizione (400)', async () => {
    const { status } = parseResult(await handler(apiEvent({ claims: citizen, body: { titolo: 'Solo titolo' } })));
    expect(status).toBe(400);
  });

  it('rifiuta un titolo troppo lungo (400)', async () => {
    const { status } = parseResult(await handler(apiEvent({
      claims: citizen, body: { titolo: 'a'.repeat(121), descrizione: 'descrizione valida' },
    })));
    expect(status).toBe(400);
  });

  it('crea SEMPRE privata, anche se il client chiede pubblico', async () => {
    const { status, body } = parseResult(await handler(apiEvent({
      claims: citizen,
      body: { titolo: 'Buche in via Roma', descrizione: 'Strada pericolosa', visibilita: 'pubblico' },
    })));
    expect(status).toBe(201);
    expect(body.visibilita).toBe('privato');
    expect(body.stato).toBe('proposta');
    expect(body.autoreId).toBe('user-1');
    expect(body.autoreNick).toBe('Marco P.');
    // e ha effettivamente scritto su DynamoDB con visibilita privata
    const item = ddb.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item?.visibilita).toBe('privato');
  });

  it('scarta coordinate fuori range (lat 999 → null)', async () => {
    const { body } = parseResult(await handler(apiEvent({
      claims: citizen,
      body: { titolo: 'Titolo valido', descrizione: 'descrizione valida', lat: 999, lng: 12 },
    })));
    expect(body.lat).toBeNull();
    expect(body.lng).toBe(12);
  });

  describe('avviso allo staff', () => {
    /** Proposta completa, con dati che NON devono comparire nell'email. */
    const proposta = {
      titolo: 'Buche lungo via Roma',
      descrizione: 'Da quando hanno rifatto l\'asfalto si sono aperte tre buche profonde.',
      luogo: 'Via Roma, Guardia Marina',
    };

    it('avvisa lo staff che c\'è una proposta da valutare', async () => {
      // Una proposta nasce privata: senza avviso resta invisibile finché qualcuno
      // non apre il backoffice. È il buco che a luglio ha lasciato dei cittadini in
      // attesa per giorni.
      const { status } = parseResult(await handler(apiEvent({ claims: citizen, body: proposta })));

      expect(status).toBe(201);
      const call = ses.commandCalls(SendEmailCommand)[0];
      expect(call, 'nessun avviso inviato').toBeDefined();
      expect(call.args[0].input.Destination?.ToAddresses).toEqual(['staff@example.com']);
      expect(call.args[0].input.Content?.Simple?.Subject?.Data).toContain('Nuova proposta');
    });

    it('NON mette nulla della proposta nell\'email', async () => {
      // Scelta esplicita dell'associazione: la proposta è privata in questo momento,
      // e il suo contenuto non deve finire nelle caselle personali dello staff
      // (Gmail, Libero) quando basta un clic per leggerlo nel backoffice.
      await handler(apiEvent({ claims: citizen, body: proposta }));

      const testo = avviso();
      expect(testo).not.toContain('Buche');
      expect(testo).not.toContain('asfalto');
      expect(testo).not.toContain('Via Roma');
      expect(testo).not.toContain('Marco');
      // Quello che invece deve esserci: il perché e dove andare.
      expect(testo).toContain('in attesa di valutazione');
      expect(testo).toMatch(/admin\.[^\s]*\/feedback/);
    });

    it('la proposta si salva anche se l\'email fallisce', async () => {
      // Best-effort: un problema di posta non deve far fallire l'invio di chi ha
      // appena scritto la sua proposta.
      ses.on(SendEmailCommand).rejects(new Error('SES giù'));

      const { status } = parseResult(await handler(apiEvent({ claims: citizen, body: proposta })));

      expect(status).toBe(201);
      expect(ddb.commandCalls(PutCommand).length).toBe(1);
    });

    it('senza staff con email verificata non invia nulla', async () => {
      cognito.reset();
      cognito.on(ListUsersInGroupCommand).resolves({ Users: [] });

      const { status } = parseResult(await handler(apiEvent({ claims: citizen, body: proposta })));

      expect(status).toBe(201);
      // Il ripiego di configurazione c'è, quindi parte comunque a quell'indirizzo:
      // un avviso in meno è peggio di un avviso a un destinatario in più.
      expect(ses.commandCalls(SendEmailCommand).length).toBe(1);
      expect(ses.commandCalls(SendEmailCommand)[0].args[0].input.Destination?.ToAddresses)
        .toEqual(['staff@example.com']);
    });
  });
});
