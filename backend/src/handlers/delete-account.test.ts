import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { handler } from './delete-account';
import { apiEvent, parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const cognito = mockClient(CognitoIdentityProviderClient);

const UT = 'user-1';
const claims = { sub: UT, 'cognito:username': UT };

/**
 * Diritto all'oblio: è l'operazione più distruttiva dell'app e tocca quattro
 * sistemi. I test coprono anche i due residui trovati provandola in produzione:
 * le segnalazioni fatte e ricevute non venivano rimosse.
 */

/** Chiavi cancellate su una certa tabella. */
function cancellati(table: string) {
  return ddb
    .commandCalls(DeleteCommand)
    .filter((c) => c.args[0].input.TableName === table)
    .map((c) => c.args[0].input.Key);
}

/** Decrementi applicati (tabella feedbacks): [id, campo]. */
function decrementi() {
  return ddb.commandCalls(UpdateCommand).map((c) => ({
    id: (c.args[0].input.Key as any)?.id,
    expr: c.args[0].input.UpdateExpression,
    delta: (c.args[0].input.ExpressionAttributeValues as any)?.[':d'],
  }));
}

beforeEach(() => {
  ddb.reset(); s3.reset(); cognito.reset();
  s3.on(DeleteObjectCommand).resolves({});
  cognito.on(AdminDeleteUserCommand).resolves({});
  ddb.on(DeleteCommand).resolves({});
  ddb.on(UpdateCommand).resolves({});

  // Una proposta propria (con foto), che ha ricevuto 1 voto e 1 segnalazione.
  ddb.on(QueryCommand, { TableName: 'Feedbacks-test' })
    .resolves({ Items: [{ id: 'mia', fotoKey: 'feedback/x.jpg' }] });
  ddb.on(QueryCommand, { TableName: 'Votes-test' })
    .resolves({ Items: [{ feedbackId: 'mia', userId: 'altro' }] });
  ddb.on(QueryCommand, { TableName: 'Comments-test' })
    .resolves({ Items: [{ feedbackId: 'mia', sk: 'REPORT#altro', tipo: 'REPORT', autoreId: 'altro' }] });
  // Un voto e una segnalazione espressi su una proposta di qualcun altro.
  ddb.on(ScanCommand, { TableName: 'Votes-test' })
    .resolves({ Items: [{ feedbackId: 'altrui', userId: UT }] });
  ddb.on(ScanCommand, { TableName: 'Comments-test' })
    .resolves({ Items: [{ feedbackId: 'altrui', sk: `REPORT#${UT}`, tipo: 'REPORT', autoreId: UT }] });
});

describe('delete-account', () => {
  it('401 se non autenticato', async () => {
    const { status } = parseResult(await handler(apiEvent({ method: 'DELETE', claims: {} })));
    expect(status).toBe(401);
    expect(cognito.commandCalls(AdminDeleteUserCommand).length).toBe(0);
  });

  it('elimina la propria proposta, la sua foto e i voti ricevuti', async () => {
    const { status } = parseResult(await handler(apiEvent({ method: 'DELETE', claims })));

    expect(status).toBe(200);
    expect(cancellati('Feedbacks-test')).toEqual([{ id: 'mia' }]);
    expect(cancellati('Votes-test')).toContainEqual({ feedbackId: 'mia', userId: 'altro' });
    expect(s3.commandCalls(DeleteObjectCommand)[0].args[0].input.Key).toBe('feedback/x.jpg');
  });

  it('rimuove il voto dato altrove e decrementa il contatore di quella proposta', async () => {
    await handler(apiEvent({ method: 'DELETE', claims }));

    expect(cancellati('Votes-test')).toContainEqual({ feedbackId: 'altrui', userId: UT });
    expect(decrementi()).toContainEqual(
      expect.objectContaining({ id: 'altrui', expr: 'ADD numeroVoti :d', delta: -1 }),
    );
  });

  it('rimuove le segnalazioni FATTE e scala il contatore', async () => {
    // Residuo trovato in produzione: restavano con l'id di chi aveva chiesto
    // di essere cancellato, e il contatore pesava ancora su quella proposta.
    await handler(apiEvent({ method: 'DELETE', claims }));

    expect(cancellati('Comments-test')).toContainEqual({ feedbackId: 'altrui', sk: `REPORT#${UT}` });
    expect(decrementi()).toContainEqual(
      expect.objectContaining({ id: 'altrui', expr: 'ADD segnalazioni :d', delta: -1 }),
    );
  });

  it('rimuove le segnalazioni RICEVUTE dalle proprie proposte', async () => {
    // Altro residuo: restavano orfane, puntando a una proposta inesistente.
    await handler(apiEvent({ method: 'DELETE', claims }));

    expect(cancellati('Comments-test')).toContainEqual({ feedbackId: 'mia', sk: 'REPORT#altro' });
  });

  it('cancella anche i voti oltre la PRIMA PAGINA', async () => {
    // DynamoDB restituisce max 1 MB per pagina: senza seguire LastEvaluatedKey
    // i voti oltre la prima pagina non venivano cancellati e i contatori delle
    // proposte altrui restavano gonfiati — dati non rimossi in una richiesta di
    // oblio, senza alcun errore visibile.
    ddb.on(ScanCommand, { TableName: 'Votes-test' })
      .resolvesOnce({ Items: [{ feedbackId: 'pag1', userId: UT }], LastEvaluatedKey: { k: 1 } })
      .resolvesOnce({ Items: [{ feedbackId: 'pag2', userId: UT }] });

    await handler(apiEvent({ method: 'DELETE', claims }));

    expect(cancellati('Votes-test')).toContainEqual({ feedbackId: 'pag1', userId: UT });
    expect(cancellati('Votes-test')).toContainEqual({ feedbackId: 'pag2', userId: UT });
    // Entrambi i contatori vanno scalati, non solo il primo.
    const ids = decrementi().filter((d) => d.expr === 'ADD numeroVoti :d').map((d) => d.id);
    expect(ids).toContain('pag1');
    expect(ids).toContain('pag2');
  });

  it('elimina l\'account Cognito per ULTIMO', async () => {
    await handler(apiEvent({ method: 'DELETE', claims }));

    // Se Cognito venisse cancellato prima e il resto fallisse, resterebbero
    // dati senza proprietario e senza modo di riprovare.
    expect(cognito.commandCalls(AdminDeleteUserCommand).length).toBe(1);
    expect(ddb.commandCalls(DeleteCommand).length).toBeGreaterThan(0);
  });

  it('non fallisce se la foto non si può eliminare', async () => {
    s3.on(DeleteObjectCommand).rejects(new Error('S3 giù'));

    const { status } = parseResult(await handler(apiEvent({ method: 'DELETE', claims })));

    expect(status).toBe(200);
  });
});
