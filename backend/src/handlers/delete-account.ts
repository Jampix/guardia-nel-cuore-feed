import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const cognito = new CognitoIdentityProviderClient({});
const FEEDBACKS_TABLE = process.env.FEEDBACKS_TABLE as string;
const VOTES_TABLE = process.env.VOTES_TABLE as string;
const PHOTO_BUCKET = process.env.PHOTO_BUCKET as string;
const USER_POOL_ID = process.env.USER_POOL_ID as string;

/**
 * DELETE /account — cancellazione account del cittadino (diritto all'oblio GDPR).
 *
 * Elimina, per l'utente autenticato (claim `sub`):
 *  1. le sue proposte (GSI `byAutore`): foto su S3 + voti ricevuti + la proposta;
 *  2. i voti che ha espresso su proposte altrui (con decremento del contatore);
 *  3. l'account Cognito (per ultimo).
 * Operazione irreversibile.
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  const userId = String(claims.sub ?? '');
  const username = String(claims['cognito:username'] ?? claims.sub ?? '');
  if (!userId) return resp(401, { message: 'Non autenticato' });

  // 1. Proposte dell'utente.
  const mine = await ddb.send(new QueryCommand({
    TableName: FEEDBACKS_TABLE,
    IndexName: 'byAutore',
    KeyConditionExpression: 'autoreId = :a',
    ExpressionAttributeValues: { ':a': userId },
  }));
  for (const f of mine.Items ?? []) {
    const feedbackId = String(f.id);
    if (f.fotoKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: PHOTO_BUCKET, Key: String(f.fotoKey) }))
        .catch((e) => console.error('Foto non eliminata:', e));
    }
    // Voti ricevuti da questa proposta (di chiunque): PK = feedbackId.
    const votes = await ddb.send(new QueryCommand({
      TableName: VOTES_TABLE,
      KeyConditionExpression: 'feedbackId = :f',
      ExpressionAttributeValues: { ':f': feedbackId },
    }));
    for (const v of votes.Items ?? []) {
      await ddb.send(new DeleteCommand({ TableName: VOTES_TABLE, Key: { feedbackId, userId: v.userId } }));
    }
    await ddb.send(new DeleteCommand({ TableName: FEEDBACKS_TABLE, Key: { id: feedbackId } }));
  }

  // 2. Voti espressi dall'utente su proposte altrui (rimaste).
  const cast = await ddb.send(new ScanCommand({
    TableName: VOTES_TABLE,
    FilterExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
  }));
  for (const v of cast.Items ?? []) {
    const feedbackId = String(v.feedbackId);
    await ddb.send(new DeleteCommand({ TableName: VOTES_TABLE, Key: { feedbackId, userId } }));
    await ddb.send(new UpdateCommand({
      TableName: FEEDBACKS_TABLE,
      Key: { id: feedbackId },
      UpdateExpression: 'ADD numeroVoti :d',
      ExpressionAttributeValues: { ':d': -1 },
      ConditionExpression: 'attribute_exists(id)',
    })).catch(() => { /* proposta già rimossa: ignora */ });
  }

  // 3. Account Cognito (per ultimo).
  await cognito.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));

  return resp(200, { deleted: true });
};

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
