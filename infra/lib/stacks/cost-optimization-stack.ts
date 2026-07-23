import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import { ProjectConfig } from '../config/interfaces';

export interface CostOptimizationStackProps extends StackProps {
  config: ProjectConfig;
  /** Email destinataria delle notifiche di budget. Se omessa, niente notifiche email. */
  budgetEmail?: string;
  /** Limite budget mensile in USD (override del default per environment). */
  budgetLimitUsd?: number;
}

/**
 * Budget mensile per environment con notifiche al 50/80/100%.
 *
 * Il limit per environment e' attualmente codificato qui (50/200/500 USD)
 * come valore di partenza ragionevole. In un progetto reale dovrebbe migrare
 * dentro `config.features` per essere configurabile per progetto.
 */
export class CostOptimizationStack extends Stack {
  public readonly budget: CfnBudget;
  public readonly budgetName: string;

  constructor(scope: Construct, id: string, props: CostOptimizationStackProps) {
    super(scope, id, props);

    const budgetLimit = props.budgetLimitUsd ?? this.getBudgetLimit(props.config.environment);
    this.budgetName = `${props.config.projectCode}-${props.config.environment}-monthly-budget`;

    // Email diretta come subscriber del budget: NON richiede la conferma della
    // sottoscrizione (a differenza di un topic SNS).
    const subscribers: CfnBudget.SubscriberProperty[] = props.budgetEmail
      ? [{ subscriptionType: 'EMAIL', address: props.budgetEmail }]
      : [];

    // Avvisi: spesa ACTUAL oltre 50/80/100% + previsione (FORECASTED) oltre 100%
    // → così ti avvisa PRIMA di sforare, non solo dopo.
    const notificationsWithSubscribers: CfnBudget.NotificationWithSubscribersProperty[] =
      subscribers.length > 0
        ? [
            ...[50, 80, 100].map((threshold) => ({
              notification: {
                comparisonOperator: 'GREATER_THAN',
                threshold,
                thresholdType: 'PERCENTAGE',
                notificationType: 'ACTUAL',
              },
              subscribers,
            })),
            {
              notification: {
                comparisonOperator: 'GREATER_THAN',
                threshold: 100,
                thresholdType: 'PERCENTAGE',
                notificationType: 'FORECASTED',
              },
              subscribers,
            },
          ]
        : [];

    this.budget = new CfnBudget(this, 'MonthlyBudget', {
      budget: {
        // Nome auto-generato da CloudFormation: evita conflitti "stesso nome"
        // quando un cambio di limite/notifiche forza la sostituzione del budget.
        budgetLimit: { amount: budgetLimit, unit: 'USD' },
        timeUnit: 'MONTHLY',
        budgetType: 'COST',
        costFilters: {
          TagKeyValue: [`Environment$${props.config.environment}`],
        },
      },
      notificationsWithSubscribers:
        notificationsWithSubscribers.length > 0 ? notificationsWithSubscribers : undefined,
    });

    new CfnOutput(this, 'BudgetName', {
      value: this.budgetName,
      description: 'AWS Budget Name',
      exportName: `${props.config.projectCode}-${props.config.environment}-budget-name`,
    });
    new CfnOutput(this, 'BudgetLimit', {
      value: `$${budgetLimit}`,
      description: 'Monthly Budget Limit',
      exportName: `${props.config.projectCode}-${props.config.environment}-budget-limit`,
    });
  }

  private getBudgetLimit(environment: string): number {
    switch (environment) {
      case 'dev':
        return 50;
      case 'staging':
        return 200;
      case 'prod':
        return 500;
      default:
        return 100;
    }
  }
}
