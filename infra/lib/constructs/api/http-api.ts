import { CfnStage, CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApiConstructProps {
  /** User pool Cognito usato dal JWT authorizer. */
  userPool: IUserPool;
  /** App client i cui token sono accettati (audience). */
  userPoolClients: IUserPoolClient[];
  /** Origin CORS ammessi. */
  allowOrigins: string[];
  /** Richieste/sec a regime consentite sull'API (default 25). */
  throttleRateLimit?: number;
  /** Picco massimo di richieste in burst (default 50). */
  throttleBurstLimit?: number;
}

/**
 * HTTP API (API Gateway v2) con autorizzatore JWT Cognito.
 *
 * Le rotte si aggiungono con `addRoute(...)`: `authenticated: true` protegge
 * la rotta col JWT authorizer, `false` la lascia pubblica.
 */
export class ApiConstruct extends Construct {
  public readonly api: HttpApi;
  private readonly authorizer: HttpUserPoolAuthorizer;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    this.authorizer = new HttpUserPoolAuthorizer('JwtAuthorizer', props.userPool, {
      userPoolClients: props.userPoolClients,
    });

    this.api = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: props.allowOrigins,
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type'],
      },
    });

    // Rate limiting a livello di stage (default route settings): protegge il
    // backend da flood/abusi. Limite complessivo dell'API (non per-utente):
    // ampio per l'uso normale di un piccolo comune, ma con un tetto.
    const stage = this.api.defaultStage?.node.defaultChild as CfnStage;
    stage.defaultRouteSettings = {
      throttlingRateLimit: props.throttleRateLimit ?? 25,
      throttlingBurstLimit: props.throttleBurstLimit ?? 50,
    };
  }

  addRoute(
    method: HttpMethod,
    path: string,
    fn: IFunction,
    opts?: { authenticated?: boolean },
  ): void {
    const slug = `${method}${path}`.replace(/\W+/g, '');
    this.api.addRoutes({
      path,
      methods: [method],
      integration: new HttpLambdaIntegration(`Int${slug}`, fn),
      authorizer: opts?.authenticated ? this.authorizer : undefined,
    });
  }
}
