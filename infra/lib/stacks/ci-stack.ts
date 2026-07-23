import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import {
  OpenIdConnectProvider,
  Role,
  WebIdentityPrincipal,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';

export interface CiStackProps extends StackProps {
  /** Repo GitHub autorizzato, formato `owner/repo`. */
  githubRepo: string;
  /** Branch da cui è consentito il deploy (es. `main`). */
  githubBranch: string;
  /** Nomi dei bucket S3 dei due frontend (da FrontendStack). */
  clientBucketName: string;
  adminBucketName: string;
  /** ID delle distribuzioni CloudFront (da FrontendStack). */
  clientDistributionId: string;
  adminDistributionId: string;
}

/**
 * Ruolo IAM assumibile da GitHub Actions via **OIDC** (nessuna chiave AWS
 * long-lived). La trust policy è vincolata a un solo repo e branch. Permessi
 * minimi: sync sui bucket dei frontend + invalidazione delle due distribuzioni.
 */
export class CiStack extends Stack {
  public readonly deployRoleArn: string;

  constructor(scope: Construct, id: string, props: CiStackProps) {
    super(scope, id, props);

    const provider = new OpenIdConnectProvider(this, 'GithubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const principal = new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
      StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
      StringLike: {
        'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:ref:refs/heads/${props.githubBranch}`,
      },
    });

    const role = new Role(this, 'GithubDeployRole', {
      assumedBy: principal,
      description: 'GitHub Actions - deploy frontend (S3 + CloudFront invalidation)',
      roleName: 'gnc-github-deploy-frontend',
    });

    // S3: sync (list + read/write/delete oggetti) sui due bucket frontend.
    const bucketArns = [props.clientBucketName, props.adminBucketName].map(
      (n) => `arn:aws:s3:::${n}`,
    );
    role.addToPolicy(
      new PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: bucketArns,
      }),
    );
    role.addToPolicy(
      new PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: bucketArns.map((a) => `${a}/*`),
      }),
    );

    // CloudFront: solo invalidazione delle due distribuzioni.
    role.addToPolicy(
      new PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [
          `arn:aws:cloudfront::${this.account}:distribution/${props.clientDistributionId}`,
          `arn:aws:cloudfront::${this.account}:distribution/${props.adminDistributionId}`,
        ],
      }),
    );

    this.deployRoleArn = role.roleArn;
    new CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRoleArn,
      description: 'ARN del ruolo da usare in GitHub Actions (role-to-assume)',
    });
  }
}
