import { IAspect, CfnResource, Tags } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

export interface NamingAspectProps {
  projectName: string;
  projectCode: string;
  environment: string;
  region: string;
}

/**
 * Maps environment names to single character codes according to IT naming convention
 * - prod -> 'p' (production)
 * - staging -> 's' (staging)
 * - dev/test -> 't' (test)
 */
export function mapEnvironmentToNamingCode(environment: string): string {
  const envMap: Record<string, string> = {
    'prod': 'p',
    'production': 'p',
    'staging': 's',
    'dev': 't',
    'development': 't',
    'test': 't',
    'uat': 't', // UAT considered as test
    'ppr': 'p'  // Pre-production considered as production
  };

  const normalized = environment.toLowerCase();
  return envMap[normalized] || 't'; // Default to test if unknown
}

/**
 * Maps AWS regions to location codes according to IT naming convention
 * - eu-west-1 -> 'aew1' (AWS Europe West 1 - Ireland)
 * - eu-central-1 -> 'aec1' (AWS Europe Central 1 - Frankfurt)
 * - eu-south-1 -> 'aes1' (AWS Europe South 1 - Milan)
 * 
 * For other regions, returns a generated code or falls back to region abbreviation
 */
export function mapRegionToLocationCode(region: string): string {
  const regionMap: Record<string, string> = {
    'eu-west-1': 'aew1',      // AWS Europe West 1 (Ireland)
    'eu-central-1': 'aec1',    // AWS Europe Central 1 (Frankfurt)
    'eu-south-1': 'aes1',      // AWS Europe South 1 (Milan)
    'eu-west-2': 'aew2',       // AWS Europe West 2 (London)
    'eu-west-3': 'aew3',       // AWS Europe West 3 (Paris)
    'eu-north-1': 'aen1',      // AWS Europe North 1 (Stockholm)
    'us-east-1': 'aue1',       // AWS US East 1 (N. Virginia)
    'us-east-2': 'aue2',       // AWS US East 2 (Ohio)
    'us-west-1': 'auw1',       // AWS US West 1 (N. California)
    'us-west-2': 'auw2',       // AWS US West 2 (Oregon)
    'ap-southeast-1': 'aps1',   // AWS Asia Pacific Southeast 1 (Singapore)
    'ap-southeast-2': 'aps2',   // AWS Asia Pacific Southeast 2 (Sydney)
    'ap-northeast-1': 'apn1',   // AWS Asia Pacific Northeast 1 (Tokyo)
    'sa-east-1': 'asa1',       // AWS South America East 1 (São Paulo)
    'ca-central-1': 'aca1'     // AWS Canada Central 1 (Montreal)
  };

  return regionMap[region] || `aw${region.replace(/-/g, '').substring(0, 2)}`; // Fallback
}

/**
 * Maps resource types to function codes according to IT naming convention
 * - EC2 Instance (web/app) -> 'as' (application server)
 * - EC2 Instance (database) -> 'db' (database server)
 * - Load Balancer -> 'lb' (load balancer)
 * - Firewall -> 'fw' (firewall)
 * - WAF -> 'wf' (web application firewall)
 * - Runner/Agent -> 'ru' (runner)
 * 
 * For resources without a direct mapping, returns undefined to use legacy naming
 */
export function mapResourceTypeToFunctionCode(cfnType: string, resourceMetadata?: Record<string, any>): string | undefined {
  // Check metadata for explicit function type
  if (resourceMetadata?.functionType) {
    return resourceMetadata.functionType;
  }

  const typeMap: Record<string, string> = {
    'AWS::EC2::Instance': 'as',  // Default to application server, can be overridden via metadata
    'AWS::ElasticLoadBalancingV2::LoadBalancer': 'lb',
    'AWS::WAFv2::WebACL': 'wf',
    'AWS::NetworkFirewall::Firewall': 'fw'
  };

  return typeMap[cfnType];
}

/**
 * Formats project identifier to max 10 characters as per IT naming convention
 * Uses project code, or extends with project name if available
 * Note: According to IT convention, max 10 chars (not necessarily padded)
 * Example: "MAP" -> "MAP", "SAPB1CLIENTE" -> "SAPB1CLIEN" (truncated)
 */
export function formatProjectCode(projectCode: string, projectName?: string): string {
  // If project code is already 10+ chars, truncate it
  if (projectCode.length >= 10) {
    return projectCode.substring(0, 10).toUpperCase();
  }

  // Try to extend with project name if available
  if (projectName) {
    // Extract alphanumeric characters from project name, convert to uppercase
    const cleanName = projectName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const combined = (projectCode.toUpperCase() + cleanName).substring(0, 10);
    return combined;
  }

  // Return project code as-is (up to 10 chars)
  return projectCode.toUpperCase().substring(0, 10);
}

export class NamingAspect implements IAspect {
  private readonly projectName: string;
  private readonly projectCode: string;
  private readonly environment: string;
  private readonly region: string;
  private readonly sequentialCounters: Map<string, number> = new Map();

  // Lista di risorse che NON supportano tag
  private readonly nonTaggableResources = [
    'AWS::EC2::VPCGatewayAttachment',
    'AWS::EC2::SubnetRouteTableAssociation',
    'AWS::EC2::Route',
    'AWS::EC2::VPCEndpointConnectionNotification',
    'AWS::EC2::VPCEndpointServicePermissions',
    'AWS::Route53::RecordSet',
    'AWS::Route53::HostedZone'
  ];

  // Resource types that should use IT naming convention
  private readonly itNamingResources = [
    'AWS::EC2::Instance',
    'AWS::ElasticLoadBalancingV2::LoadBalancer',
    'AWS::WAFv2::WebACL',
    'AWS::NetworkFirewall::Firewall'
  ];

  constructor(props: NamingAspectProps) {
    this.projectName = props.projectName;
    this.projectCode = props.projectCode;
    this.environment = props.environment;
    this.region = props.region;
  }

  visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      // Skip resources that don't support tags
      if (this.nonTaggableResources.includes(node.cfnResourceType)) {
        return;
      }

      // Only apply naming if not already customized
      if (!node.cfnOptions.metadata?.['custom-name']) {
        // Solo le risorse "server-like" (EC2/ELB/WAF/Firewall) ricevono un
        // nome secondo la IT naming convention. Le risorse serverless
        // (Lambda, S3, DynamoDB, Cognito, IAM, ...) NON ricevono un nome
        // fisico: lo genera CloudFormation dal logical ID (deterministico).
        // In questo progetto (100% serverless) di fatto nessuna risorsa viene
        // rinominata qui; gli aspects applicano comunque i tag.
        //
        // NB: rimosso il naming "legacy" con suffisso uuidv4 perché
        // non-deterministico — rompeva l'idempotenza di synth/deploy.
        if (this.itNamingResources.includes(node.cfnResourceType)) {
          const itName = this.generateITNamingConventionName(node);
          if (itName) {
            this.applyNamingByResourceType(node, itName);
          }
        }
      }
    }
  }

  /**
   * Generates a name according to IT naming convention:
   * {env}{os}{function}{project}{seq}{location}
   * Example: slasMAP0000001aew1
   */
  private generateITNamingConventionName(resource: CfnResource): string | null {
    const functionCode = mapResourceTypeToFunctionCode(resource.cfnResourceType, resource.cfnOptions.metadata);
    if (!functionCode) {
      return null; // Use legacy naming
    }

    // Environment code (1 char)
    const envCode = mapEnvironmentToNamingCode(this.environment);

    // OS code (1 char) - AWS EC2 instances are Linux by default
    // Can be overridden via metadata if needed
    const osCode = resource.cfnOptions.metadata?.osType || 'l'; // 'l' = Linux, 'w' = Windows, 'a' = Appliance

    // Function code (2 chars) - already retrieved above

    // Project code (max 10 chars)
    const projectCode = formatProjectCode(this.projectCode, this.projectName);

    // Sequential number (2 chars, 00-99)
    const seqKey = `${resource.cfnResourceType}-${functionCode}`;
    const currentSeq = this.sequentialCounters.get(seqKey) || 0;
    if (currentSeq >= 100) {
      // If we exceed 99, fall back to legacy naming
      return null;
    }
    this.sequentialCounters.set(seqKey, currentSeq + 1);
    const seqCode = currentSeq.toString().padStart(2, '0');

    // Location code (4 chars)
    const locationCode = mapRegionToLocationCode(this.region);

    // Combine: {env}{os}{function}{project}{seq}{location}
    return `${envCode}${osCode}${functionCode}${projectCode}${seqCode}${locationCode}`;
  }

  private applyNamingByResourceType(resource: CfnResource, baseName: string): void {
    const resourceType = resource.cfnResourceType;

    // Per il tag "Name" usiamo SEMPRE Tags.of(...).add() e NON
    // addPropertyOverride('Tags', [...]). Motivazione: addPropertyOverride
    // sovrascrive l'intero array Tags, cancellando i tag standard gia'
    // applicati dal TaggingAspect (Project, Environment, Owner, ecc.).
    // Tags.of().add() e' il merge corretto. Per le proprieta' non-tag
    // (BucketName, LogGroupName, ecc.) addPropertyOverride resta corretto.
    //
    // Asimmetria voluta: il tag "Name" lo aggiungiamo SOLO alle risorse
    // server-like (VPC, Subnet, Instance, IGW, SG) perche' la console AWS
    // usa quel tag come display. Per S3/LogGroup/Alarm/Lambda/Role/Policy
    // la proprieta' CFN nominale (BucketName, LogGroupName, ecc.) e' gia'
    // l'identificatore visibile in console: aggiungere un tag Name
    // duplicherebbe l'informazione e creerebbe due fonti di verita'.
    //
    // Vedi docs/adr/006-tags-of-vs-property-override.md.
    switch (resourceType) {
      case 'AWS::EC2::VPC':
      case 'AWS::EC2::Subnet':
      case 'AWS::EC2::Instance':
      case 'AWS::EC2::InternetGateway':
        Tags.of(resource).add('Name', baseName);
        break;

      case 'AWS::EC2::SecurityGroup':
        // GroupName e' una proprieta' CFN (non un tag): addPropertyOverride
        // e' qui appropriato. Il tag Name passa per Tags.of().
        resource.addPropertyOverride('GroupName', baseName);
        Tags.of(resource).add('Name', baseName);
        break;

      case 'AWS::S3::Bucket':
        // S3 bucket names must be globally unique
        resource.addPropertyOverride('BucketName', baseName.toLowerCase());
        break;

      case 'AWS::CloudWatch::LogGroup':
        resource.addPropertyOverride('LogGroupName', `/${this.projectName}/${this.environment}/${baseName}`);
        break;

      case 'AWS::CloudWatch::Alarm':
        resource.addPropertyOverride('AlarmName', baseName);
        break;

      case 'AWS::Events::Rule':
        resource.addPropertyOverride('Name', baseName);
        break;

      case 'AWS::Lambda::Function':
        resource.addPropertyOverride('FunctionName', baseName);
        break;

      case 'AWS::IAM::Role':
        resource.addPropertyOverride('RoleName', baseName);
        break;

      case 'AWS::IAM::Policy':
        resource.addPropertyOverride('PolicyName', baseName);
        break;
    }
  }
}