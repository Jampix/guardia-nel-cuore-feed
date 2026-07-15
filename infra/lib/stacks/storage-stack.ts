import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { ProjectConfig } from '../config/interfaces';
import { PhotoBucketConstruct } from '../constructs/storage/photo-bucket';

export interface StorageStackProps extends StackProps {
  config: ProjectConfig;
  /**
   * Origini HTTP del frontend autorizzate a caricare foto via presigned PUT
   * (CORS). Passate dal compose() a partire dal dominio configurato.
   */
  allowedOrigins: string[];
}

/**
 * Stack di storage: il bucket S3 privato per le foto dei feedback.
 *
 * Espone nome e ARN del bucket come stringhe, così l'ApiStack potrà concedere
 * alla Lambda "presign" i permessi minimi (PutObject/GetObject) sul solo
 * bucket foto (convenzione cross-stack: si passano stringhe, mai oggetti CDK).
 */
export class StorageStack extends Stack {
  public readonly photoBucketName: string;
  public readonly photoBucketArn: string;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // TODO(go-live): impostare RemovalPolicy.RETAIN per non perdere le foto.
    const removalPolicy = RemovalPolicy.DESTROY;

    const photos = new PhotoBucketConstruct(this, 'Photos', {
      removalPolicy,
      allowedOrigins: props.allowedOrigins,
    });

    this.photoBucketName = photos.bucket.bucketName;
    this.photoBucketArn = photos.bucket.bucketArn;

    const code = props.config.projectCode;
    new CfnOutput(this, 'PhotoBucketName', {
      value: this.photoBucketName,
      exportName: `${code}-photo-bucket-name`,
    });
    new CfnOutput(this, 'PhotoBucketArn', {
      value: this.photoBucketArn,
      exportName: `${code}-photo-bucket-arn`,
    });
  }
}
