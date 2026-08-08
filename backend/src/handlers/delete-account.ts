import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { cancellaDatiUtente } from '../lib/cancella-dati-utente';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const cognito = new CognitoIdentityProviderClient({});
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const VOTES_TABLE = process.env.VOTES_TABLE as string;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE as string;
const PHOTO_BUCKET = process.env.PHOTO_BUCKET as string;
const USER_POOL_ID = process.env.USER_POOL_ID as string;

/**
 * DELETE /account — cancellazione account del cittadino (diritto all'oblio GDPR).
 *
 * Elimina, per l'utente autenticato (claim `sub`), le sue proposte con foto e
 * voti ricevuti, i voti che ha espresso altrove e le segnalazioni che ha fatto —
 * la pulizia sta in `lib/cancella-dati-utente.ts`, condivisa con la rimozione
 * dal backoffice — e per ultimo l'account Cognito.
 *
 * L'ordine non è un dettaglio: se si cancellasse prima l'utente e poi la pulizia
 * fallisse, non resterebbe modo di sapere di chi erano i dati rimasti.
 *
 * Operazione irreversibile.
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  const userId = String(claims.sub ?? '');
  const username = String(claims['cognito:username'] ?? claims.sub ?? '');
  if (!userId) return resp(401, { message: 'Non autenticato' });

  const rimosso = await cancellaDatiUtente(ddb, s3, userId, {
    feedbacks: FEEDBACKS_TABLE,
    votes: VOTES_TABLE,
    comments: COMMENTS_TABLE,
    photoBucket: PHOTO_BUCKET,
  });

  // Account Cognito per ultimo.
  await cognito.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));

  console.log('Account cancellato su richiesta dell\'interessato', rimosso);
  return resp(200, { deleted: true });
};

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
