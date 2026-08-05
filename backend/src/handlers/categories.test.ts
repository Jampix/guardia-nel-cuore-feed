import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './categories';
import { parseResult } from './_test-helpers';

const ddb = mockClient(DynamoDBDocumentClient);

/**
 * Categorie offerte al cittadino nel form "Nuova proposta". Se una categoria
 * disattivata comparisse ancora, si potrebbero creare proposte in una categoria
 * che lo staff ha ritirato.
 */
beforeEach(() => ddb.reset());

describe('categories', () => {
  it('esclude le categorie disattivate', async () => {
    ddb.on(ScanCommand).resolves({
      Items: [
        { id: 'attiva', nome: 'Strade', attiva: true },
        { id: 'spenta', nome: 'Vecchia', attiva: false },
      ],
    });

    const { status, body } = parseResult(await handler());

    expect(status).toBe(200);
    expect(body.map((c: any) => c.id)).toEqual(['attiva']);
  });

  it('considera attiva una categoria senza il campo `attiva`', async () => {
    // Le categorie seedate all'inizio non hanno il campo: escluderle
    // svuoterebbe il menu delle proposte.
    ddb.on(ScanCommand).resolves({ Items: [{ id: 'vecchio-seed', nome: 'Strade' }] });

    const { body } = parseResult(await handler());

    expect(body.length).toBe(1);
  });

  it('ordina per nome', async () => {
    ddb.on(ScanCommand).resolves({
      Items: [
        { id: '1', nome: 'Verde' },
        { id: '2', nome: 'Cultura' },
        { id: '3', nome: 'Strade' },
      ],
    });

    const { body } = parseResult(await handler());

    expect(body.map((c: any) => c.nome)).toEqual(['Cultura', 'Strade', 'Verde']);
  });

  it('risponde con una lista vuota se non ce ne sono', async () => {
    ddb.on(ScanCommand).resolves({});
    const { status, body } = parseResult(await handler());
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});
