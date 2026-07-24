import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const COMMENTS_TABLE = process.env.COMMENTS_TABLE as string;

/**
 * GET /admin/feedback/{id}/reports — motivi delle segnalazioni di una proposta
 * (staff). Legge FeedbackComments (PK feedbackId, SK `REPORT#...`). Non espone
 * l'identità del segnalante: solo motivo e data.
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const groups = String(event.requestContext.authorizer?.jwt?.claims?.['cognito:groups'] ?? '');
  if (!/\b(admin|membro)\b/.test(groups)) {
    return resp(403, { message: 'Accesso riservato allo staff.' });
  }

  const feedbackId = event.pathParameters?.id;
  if (!feedbackId) return resp(400, { message: 'id mancante' });

  const res = await ddb.send(new QueryCommand({
    TableName: COMMENTS_TABLE,
    KeyConditionExpression: 'feedbackId = :f AND begins_with(sk, :p)',
    ExpressionAttributeValues: { ':f': feedbackId, ':p': 'REPORT#' },
  }));

  const reports = (res.Items ?? [])
    .map((r) => ({ motivo: r.motivo ? String(r.motivo) : '', createdAt: r.createdAt }))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

  return resp(200, reports);
};

function resp(statusCode: number, obj: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
