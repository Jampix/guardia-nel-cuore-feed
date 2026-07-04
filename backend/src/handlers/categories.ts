import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CATEGORIES_TABLE = process.env.CATEGORIES_TABLE as string;

/**
 * GET /categories — elenco delle categorie attive (endpoint pubblico).
 * Serve al form di creazione feedback per popolare la scelta della categoria.
 */
export const handler = async (): Promise<APIGatewayProxyResultV2> => {
  const res = await ddb.send(new ScanCommand({ TableName: CATEGORIES_TABLE }));
  const categorie = (res.Items ?? [])
    .filter((c) => c.attiva !== false)
    .sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? '')));

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(categorie),
  };
};
