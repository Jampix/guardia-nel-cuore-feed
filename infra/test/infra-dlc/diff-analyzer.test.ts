import {
  analyzeChanges,
  analyze,
  fromChangeSet,
  fromCdkDiffText,
  DEFAULT_POLICY,
  ResourceChange,
} from '../../tools/infra-dlc/diff-analyzer';

describe('Infra-DLC C2 — analyzeChanges (core)', () => {
  it('blocca REPLACE su risorsa stateful + immutable-name (S3 bucket)', () => {
    const changes: ResourceChange[] = [
      { logicalId: 'DataBucket', resourceType: 'AWS::S3::Bucket', impact: 'replace' },
    ];
    const v = analyzeChanges(changes);
    expect(v).toHaveLength(1);
    expect(v[0].categories).toEqual(expect.arrayContaining(['stateful', 'immutable-name']));
    expect(v[0].selfCorrection).toMatch(/RETAIN/);
    expect(v[0].selfCorrection).toMatch(/NamingAspect|determinism/i);
  });

  it('blocca DESTROY su risorsa stateful (RDS)', () => {
    const v = analyzeChanges([
      { logicalId: 'Db', resourceType: 'AWS::RDS::DBInstance', impact: 'destroy' },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].categories).toContain('stateful');
  });

  it('NON blocca REPLACE su risorsa stateless senza nome immutable (SecurityGroup)', () => {
    const v = analyzeChanges([
      { logicalId: 'WebSg', resourceType: 'AWS::EC2::SecurityGroup', impact: 'replace' },
    ]);
    expect(v).toHaveLength(0);
  });

  it('NON blocca un semplice UPDATE su risorsa stateful', () => {
    const v = analyzeChanges([
      { logicalId: 'DataBucket', resourceType: 'AWS::S3::Bucket', impact: 'update' },
    ]);
    expect(v).toHaveLength(0);
  });

  it('blocca conditional-replace di default, ma non con blockConditional=false', () => {
    const changes: ResourceChange[] = [
      { logicalId: 'AppRole', resourceType: 'AWS::IAM::Role', impact: 'conditional-replace' },
    ];
    expect(analyzeChanges(changes)).toHaveLength(1);
    expect(
      analyzeChanges(changes, { ...DEFAULT_POLICY, blockConditional: false }),
    ).toHaveLength(0);
  });
});

describe('Infra-DLC C2 — fromChangeSet (adapter robusto)', () => {
  const description = {
    Changes: [
      {
        Type: 'Resource',
        ResourceChange: {
          Action: 'Modify',
          LogicalResourceId: 'DataBucket',
          ResourceType: 'AWS::S3::Bucket',
          Replacement: 'True',
        },
      },
      {
        Type: 'Resource',
        ResourceChange: {
          Action: 'Modify',
          LogicalResourceId: 'AppRole',
          ResourceType: 'AWS::IAM::Role',
          Replacement: 'Conditional',
        },
      },
      {
        Type: 'Resource',
        ResourceChange: {
          Action: 'Modify',
          LogicalResourceId: 'WebSg',
          ResourceType: 'AWS::EC2::SecurityGroup',
          Replacement: 'False',
        },
      },
      {
        Type: 'Resource',
        ResourceChange: {
          Action: 'Remove',
          LogicalResourceId: 'OldDb',
          ResourceType: 'AWS::RDS::DBInstance',
        },
      },
      {
        Type: 'Resource',
        ResourceChange: {
          Action: 'Add',
          LogicalResourceId: 'NewQueue',
          ResourceType: 'AWS::SQS::Queue',
        },
      },
    ],
  };

  it('normalizza Action/Replacement nei giusti impatti', () => {
    const changes = fromChangeSet(description);
    expect(changes).toEqual([
      { logicalId: 'DataBucket', resourceType: 'AWS::S3::Bucket', impact: 'replace' },
      { logicalId: 'AppRole', resourceType: 'AWS::IAM::Role', impact: 'conditional-replace' },
      { logicalId: 'WebSg', resourceType: 'AWS::EC2::SecurityGroup', impact: 'update' },
      { logicalId: 'OldDb', resourceType: 'AWS::RDS::DBInstance', impact: 'destroy' },
      { logicalId: 'NewQueue', resourceType: 'AWS::SQS::Queue', impact: 'create' },
    ]);
  });

  it('analisi end-to-end dal change set → 3 violazioni', () => {
    const report = analyze(fromChangeSet(description));
    expect(report.ok).toBe(false);
    const ids = report.violations.map((v) => v.logicalId).sort();
    expect(ids).toEqual(['AppRole', 'DataBucket', 'OldDb']);
  });
});

describe('Infra-DLC C2 — fromCdkDiffText (adapter fallback)', () => {
  const diff = [
    'Stack MyStack',
    'Resources',
    '[~] AWS::S3::Bucket MyBucket MyBucketB1234',
    ' └─ [~] BucketName (requires replacement)',
    '     ├─ [-] old-bucket',
    '     └─ [+] new-bucket',
    '[~] AWS::IAM::Role MyRole MyRoleABCD',
    ' └─ [~] RoleName (may be replaced)',
    '[+] AWS::SNS::Topic NewTopic NewTopic9999',
    '[-] AWS::EC2::SecurityGroup OldSg OldSgZZZZ destroy',
  ].join('\n');

  it('estrae impatti corretti dal testo (promozione via property line)', () => {
    const changes = fromCdkDiffText(diff);
    expect(changes).toEqual([
      { logicalId: 'MyBucketB1234', resourceType: 'AWS::S3::Bucket', impact: 'replace' },
      { logicalId: 'MyRoleABCD', resourceType: 'AWS::IAM::Role', impact: 'conditional-replace' },
      { logicalId: 'NewTopic9999', resourceType: 'AWS::SNS::Topic', impact: 'create' },
      { logicalId: 'OldSgZZZZ', resourceType: 'AWS::EC2::SecurityGroup', impact: 'destroy' },
    ]);
  });

  it('analisi end-to-end dal testo → blocca bucket e role, non topic/sg', () => {
    const report = analyze(fromCdkDiffText(diff));
    const ids = report.violations.map((v) => v.logicalId).sort();
    expect(ids).toEqual(['MyBucketB1234', 'MyRoleABCD']);
  });
});
