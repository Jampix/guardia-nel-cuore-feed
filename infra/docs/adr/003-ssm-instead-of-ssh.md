# ADR-003 — SSM Session Manager invece di SSH

**Status**: accepted

## Context

L'EC2 deve essere accessibile dal team operations per debug, deploy
manuale, ispezione log. La via tradizionale è SSH (porta 22) con chiavi
PEM. Il template iniziale apriva la porta 22 a `0.0.0.0/0` su tutti gli
environment, con la chiave EC2 gestita esternamente.

Problemi di questo approccio:
- chi ottiene la chiave PEM ha accesso permanente, indipendentemente dal
  proprio ruolo IAM;
- la chiave non è ruotabile facilmente;
- il SG aperto al mondo rende l'istanza un bersaglio di scansioni;
- l'audit di "chi ha fatto cosa" si basa sui log dell'istanza, non c'è
  trail centrale.

## Decision

L'accesso interattivo all'istanza passa per **AWS SSM Session Manager**.
L'EC2 ha l'IAM role `AmazonSSMManagedInstanceCore` (gestito da AWS) e si
collega al servizio SSM in outbound. Niente porta inbound aperta, niente
chiave PEM da gestire.

SSH inbound non è abilitato di default: il SG apre la porta 22 solo se
`config.compute.web.allowedSshCidrs` contiene almeno un CIDR. Default:
array vuoto su tutti gli env del template.

## Consequences

**Positive**:
- accesso autenticato e autorizzato via IAM (chi può fare `ssm:StartSession`
  sull'istanza target);
- audit log centralizzato in CloudTrail;
- nessuna porta inbound aperta a internet;
- niente chiave PEM da custodire/ruotare.

**Negative**:
- richiede SSM Agent attivo sull'istanza (preinstallato su Amazon Linux,
  va verificato su Ubuntu — sui template Canonical AMI standard è
  installato);
- richiede connettività outbound dell'istanza verso gli endpoint SSM
  (ssm, ec2messages, ssmmessages). Su VPC privati senza NAT serve un
  VPC endpoint Interface;
- esperienza utente leggermente diversa da SSH: si lancia
  `aws ssm start-session --target i-xxx` invece di `ssh -i key.pem`.

## Alternatives considerate

- **SSH bastion host**: aggiunge un'istanza in più da gestire, e comunque
  usa chiavi PEM.
- **SSH con CIDR ristretti** (ufficio, VPN): accettabile come deroga su
  ambienti specifici via `allowedSshCidrs`. Default rimane SSM.
- **EC2 Instance Connect**: richiede IAM ma usa SSH sotto il cofano,
  porta 22 deve essere aperta verso CIDR specifici di AWS. Minor vantaggio
  rispetto a SSM.
