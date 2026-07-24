import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

/** Costruisce un evento HTTP API minimale con claim JWT, per i test. */
export function apiEvent(opts: {
  method?: string;
  body?: unknown;
  pathParameters?: Record<string, string>;
  claims?: Record<string, unknown>;
}): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: {
      http: { method: opts.method ?? 'POST' },
      authorizer: { jwt: { claims: opts.claims ?? {} } },
    },
    pathParameters: opts.pathParameters,
    rawPath: '/',
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

/** Estrae lo status e il body JSON da una risposta di handler. */
export function parseResult(res: any): { status: number; body: any } {
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
}
