import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { ProjectConfig } from '../config/interfaces';

export interface CostOptimizationStackProps extends StackProps {
  config: ProjectConfig;
  /** Email destinataria delle notifiche di budget. Se omessa, niente notifiche email. */
  budgetEmail?: string;
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
  public readonly budgetTopic?: Topic;
  public readonly budgetName: string;

  constructor(scope: Construct, id: string, props: CostOptimizationStackProps) {
    super(scope, id, props);

    const budgetLimit = this.getBudgetLimit(props.config.environment);
    this.budgetName = `${props.config.projectCode}-${props.config.environment}-monthly-budget`;

    if (props.budgetEmail) {
      this.budgetTopic = new Topic(this, 'BudgetTopic', {
        topicName: `${props.config.projectCode}-${props.config.environment}-budget-alerts`,
        displayName: `Budget alerts for ${props.config.projectName} ${props.config.environment}`,
      });
      this.budgetTopic.addSubscription(new EmailSubscription(props.budgetEmail));
    }

    const subscribers: CfnBudget.SubscriberProperty[] = [];
    if (props.budgetEmail) {
      subscribers.push({ subscriptionType: 'EMAIL', address: props.budgetEmail });
    }
    if (this.budgetTopic) {
      subscribers.push({ subscriptionType: 'SNS', address: this.budgetTopic.topicArn });
    }

    const thresholds = [50, 80, 100];
    const notificationsWithSubscribers: CfnBudget.NotificationWithSubscribersProperty[] =
      subscribers.length > 0
        ? thresholds.map((threshold) => ({
            notification: {
              comparisonOperator: 'GREATER_THAN',
              threshold,
              thresholdType: 'PERCENTAGE',
              notificationType: 'ACTUAL',
            },
            subscribers,
          }))
        : [];

    this.budget = new CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: this.budgetName,
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
    if (this.budgetTopic) {
      new CfnOutput(this, 'BudgetTopicArn', {
        value: this.budgetTopic.topicArn,
        description: 'SNS Topic ARN for Budget Alerts',
        exportName: `${props.config.projectCode}-${props.config.environment}-budget-topic`,
      });
    }
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
