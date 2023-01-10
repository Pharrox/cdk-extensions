import { CfnTrigger } from 'aws-cdk-lib/aws-glue';
import { IConstruct } from 'constructs';
import { ICrawler, ITriggerPredicate } from '../..';
import { WorkflowPredicateBase, PredicateLogicalOperator, WorkflowPredicateOptions } from './predicate-base';


export enum CrawlerState {
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  SUCCEEDED = 'SUCCEEDED'
}

export interface WorkflowCrawlerPredicateOptions extends WorkflowPredicateOptions {
  readonly logicalOperator: PredicateLogicalOperator;
  readonly state?: CrawlerState;
}

export class WorkflowCrawlerPredicate extends WorkflowPredicateBase implements ITriggerPredicate {
  // Input properties
  public readonly crawler: ICrawler;
  public readonly logicalOperator: PredicateLogicalOperator;
  public readonly state: CrawlerState;


  public constructor(crawler: ICrawler, options?: WorkflowCrawlerPredicateOptions) {
    super(options);

    this.crawler = crawler;
    this.logicalOperator = options?.logicalOperator ?? PredicateLogicalOperator.EQUALS;
    this.state = options?.state ?? CrawlerState.SUCCEEDED;
  }

  public bind(scope: IConstruct): CfnTrigger.ConditionProperty {
    return {
      ...super.bindOptions(scope),
      crawlerName: this.crawler.crawlerName,
      crawlState: this.state,
      logicalOperator: this.logicalOperator,
    };
  }
}