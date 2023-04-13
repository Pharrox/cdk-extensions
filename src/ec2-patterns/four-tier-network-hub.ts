import { ResourceProps, Stack, Token } from 'aws-cdk-lib';
import { DefaultInstanceTenancy, GatewayVpcEndpointOptions, SubnetSelection, VpnConnectionOptions } from 'aws-cdk-lib/aws-ec2';
import { IConstruct } from 'constructs';
import { FlowLogOptions, FourTierNetwork } from '.';
import { FourTierNetworkSpoke } from './four-tier-network-spoke';
import { TransitGateway, TransitGatewayProps } from '../ec2';
import { CidrProvider, ICidrProvider } from '../ec2/lib/ip-addresses/network-provider';
import { NatProvider } from '../ec2/lib/nat-providers/nat-provider';
import { ITransitGateway } from '../ec2/transit-gateway';
import { GlobalNetwork } from '../networkmanager/global-network';
import { IResourceShare, ISharedPrincipal, ResourceShare, SharedPrincipal } from '../ram';
import { SharedResource } from '../ram-resources';


export interface FourTierNetworkShareProperties {
  readonly autoAddAccounts?: boolean;
  readonly allowExternalPrincipals?: boolean;
  readonly pricipals?: ISharedPrincipal[];
}

export interface AddSpokeNetworkProps {
  readonly availabilityZones?: string[];
  readonly cidr?: ICidrProvider;
  readonly defaultInstanceTenancy?: DefaultInstanceTenancy;
  readonly enableDnsHostnames?: boolean;
  readonly enableDnsSupport?: boolean;
  readonly flowLogs?: { [id: string]: FlowLogOptions };
  readonly gatewayEndpoints?: { [id: string]: GatewayVpcEndpointOptions };
  readonly maxAzs?: number;
  readonly vpcName?: string;
  readonly vpnConnections?: {[id: string]: VpnConnectionOptions};
  readonly vpnGateway?: boolean;
  readonly vpnGatewayAsn?: number;
  readonly vpnRoutePropagation?: SubnetSelection[];
}

export interface FourTierNetworkHubProps extends ResourceProps {
  readonly availabilityZones?: string[];
  readonly cidr?: ICidrProvider;
  readonly defaultInstanceTenancy?: DefaultInstanceTenancy;
  readonly enableDnsHostnames?: boolean;
  readonly enableDnsSupport?: boolean;
  readonly flowLogs?: { [id: string]: FlowLogOptions };
  readonly gatewayEndpoints?: { [id: string]: GatewayVpcEndpointOptions };
  readonly globalNetwork?: GlobalNetwork;
  readonly maxAzs?: number;
  readonly sharing?: FourTierNetworkShareProperties;
  readonly vpcName?: string;
  readonly vpnConnections?: {[id: string]: VpnConnectionOptions};
  readonly vpnGateway?: boolean;
  readonly vpnGatewayAsn?: number;
  readonly vpnRoutePropagation?: SubnetSelection[];
}

export class FourTierNetworkHub extends FourTierNetwork {
  private readonly _flowLogConfiguration?: { [id: string]: FlowLogOptions };
  private readonly _sharedAccounts: string[];

  private _resourceShare?: IResourceShare;
  private _transitGateway?: ITransitGateway;

  public readonly globalNetwork?: GlobalNetwork;
  public readonly sharing: FourTierNetworkShareProperties;

  public get transitGateway(): ITransitGateway | undefined {
    return this._transitGateway;
  }


  public constructor(scope: IConstruct, id: string, props: FourTierNetworkHubProps = {}) {
    super(scope, id, {
      ...props,
      natGatewayProvider: NatProvider.gateway(),
      natGatewaySubnets: {
        onePerAz: true,
        subnetGroupName: 'public',
      },
    });

    this._flowLogConfiguration = props.flowLogs;

    this.globalNetwork = props.globalNetwork;
    this.sharing = props.sharing ?? {
      autoAddAccounts: true,
    };

    if (this.sharing.pricipals) {
      const resourceShare = this._ensureResourceShare();

      this.sharing.pricipals.forEach((x) => {
        resourceShare.addPrincipal(x);
      });
    }

    this._sharedAccounts = [];
  }

  private _addSharedAccount(accountId: string): void {
    if (!this._sharedAccounts.includes(accountId)) {
      const resourceShare = this._ensureResourceShare();
      resourceShare.addPrincipal(SharedPrincipal.fromAccountId(accountId));
      this._sharedAccounts.push(accountId);
    }
  }

  private _ensureResourceShare(): IResourceShare {
    const transitGateway = this.transitGateway ?? this.enableTransitGateway();

    if (!this._resourceShare) {
      this._resourceShare = new ResourceShare(this, 'resource-share', {
        resources: [
          SharedResource.fromTransitGateway(transitGateway),
        ],
        ...this.sharing,
      });
      return this._resourceShare;
    } else {
      return this._resourceShare;
    }
  }

  public addSpoke(scope: IConstruct, id: string, props: AddSpokeNetworkProps = {}): FourTierNetworkSpoke {
    if (this.transitGateway === undefined) {
      this.enableTransitGateway();
    }

    if (this.sharing.autoAddAccounts) {
      const scopeAccount = Stack.of(scope).account;

      if (!Token.isUnresolved(scopeAccount) && scopeAccount !== this.stack.account) {
        this._addSharedAccount(scopeAccount);
      }
    }

    const provider = (!props.cidr && this.ipamPool) ? CidrProvider.ipamPool(this.ipamPool, this.netmask) : props.cidr;

    return new FourTierNetworkSpoke(scope, id, {
      cidr: provider,
      defaultInstanceTenancy: this.defaultInstanceTenancy,
      enableDnsHostnames: this.enableDnsHostnames,
      enableDnsSupport: this.enableDnsSupport,
      flowLogs: this._flowLogConfiguration,
      hub: this,
      ...props,
    });
  }

  public enableTransitGateway(props: TransitGatewayProps = {}): ITransitGateway {
    if (this._transitGateway) {
      throw new Error([
        `Transit gateway is already enabled for VPC ${this.node.path}`,
      ].join(' '));
    }

    this._transitGateway = new TransitGateway(this, 'transit-gateway', {
      autoAcceptSharedAttachments: true,
      ...props,
    });

    this._transitGateway.attachVpc(this, {
      subnets: {
        onePerAz: true,
        subnetGroupName: 'dmz',
      },
    });

    this.globalNetwork?.registerTransitGateway(this._transitGateway.node.addr, {
      transitGateway: this._transitGateway,
    });

    return this._transitGateway;
  }
}