/* eslint-disable */
// chaind v0.1.0 531b5f9feca9a458710a75e770b5ad8f4bdb77e2
// --
// This file has been generated by https://github.com/webrpc/webrpc using gen/typescript
// Do not edit by hand. Update your webrpc schema and re-generate.

// WebRPC description and code-gen version
export const WebRPCVersion = "v1"

// Schema version of your RIDL schema
export const WebRPCSchemaVersion = "v0.1.0"

// Schema hash generated from your RIDL schema
export const WebRPCSchemaHash = "531b5f9feca9a458710a75e770b5ad8f4bdb77e2"


//
// Types
//
export enum SortOrder {
  DESC = 'DESC',
  ASC = 'ASC'
}

export interface Balance {
  id: number
  contractAddress: string
  contractAlias: string
  accountAddress: string
  tokenID: string
  amountLatest: string
  amountConfirmed: string
  blockHash: string
  blockHeight: number
  
  updatedAt: string
  createdAt: string
}

export interface EtherBalance {
  accountAddress: string
  amountLatestWei: string
  amountConfirmedWei: string
  lastBlockHeight: number
}

export interface GasReceipt {
  gasFee: string
  gasLimit: Array<string>
}

export interface TokenTransfer {
  recipientAddress: string
  tokenID: string
  tokenAmount: string
}

export interface RuntimeStatus {
  chainState: Array<any>
}

export interface Version {
  webrpcVersion: string
  schemaVersion: string
  schemaHash: string
  appVersion: string
}

export interface Page {
  pageSize?: number
  page?: number
  totalRecords?: number
  column?: string
  before?: any
  after?: any
  sort?: Array<SortBy>
}

export interface SortBy {
  column: string
  order: SortOrder
}

export interface ChaindService {
  ping(headers?: object): Promise<PingReturn>
  version(headers?: object): Promise<VersionReturn>
  runtimeStatus(headers?: object): Promise<RuntimeStatusReturn>
  etherBalance(args: EtherBalanceArgs, headers?: object): Promise<EtherBalanceReturn>
  contractBalanceOf(args: ContractBalanceOfArgs, headers?: object): Promise<ContractBalanceOfReturn>
  contractBalanceOfTokenIDs(args: ContractBalanceOfTokenIDsArgs, headers?: object): Promise<ContractBalanceOfTokenIDsReturn>
  contractBalanceSync(args: ContractBalanceSyncArgs, headers?: object): Promise<ContractBalanceSyncReturn>
  contractBalanceSyncTokenIDs(args: ContractBalanceSyncTokenIDsArgs, headers?: object): Promise<ContractBalanceSyncTokenIDsReturn>
  contractCall(args: ContractCallArgs, headers?: object): Promise<ContractCallReturn>
}

export interface PingArgs {
}

export interface PingReturn {
  status: boolean  
}
export interface VersionArgs {
}

export interface VersionReturn {
  version: Version  
}
export interface RuntimeStatusArgs {
}

export interface RuntimeStatusReturn {
  status: RuntimeStatus  
}
export interface EtherBalanceArgs {
  accountAddress: string
}

export interface EtherBalanceReturn {
  balance: EtherBalance  
}
export interface ContractBalanceOfArgs {
  contractHandle: string
  accountAddress: string
}

export interface ContractBalanceOfReturn {
  status: boolean
  balances: Array<Balance>  
}
export interface ContractBalanceOfTokenIDsArgs {
  contractHandle: string
  accountAddress: string
  tokenIDs: Array<string>
}

export interface ContractBalanceOfTokenIDsReturn {
  status: boolean
  balances: Array<Balance>  
}
export interface ContractBalanceSyncArgs {
  contractHandle: string
  accountAddress: string
}

export interface ContractBalanceSyncReturn {
  status: boolean
  balances: Array<Balance>  
}
export interface ContractBalanceSyncTokenIDsArgs {
  contractHandle: string
  accountAddress: string
  tokenIDs: Array<string>
}

export interface ContractBalanceSyncTokenIDsReturn {
  status: boolean
  balances: Array<Balance>  
}
export interface ContractCallArgs {
  contract: string
  inputExpr: string
  outputExpr: string
  args: Array<string>
}

export interface ContractCallReturn {
  returns: Array<string>  
}


  
//
// Client
//
export class ChaindService implements ChaindService {
  protected hostname: string
  protected fetch: Fetch
  protected path = '/rpc/ChaindService/'

  constructor(hostname: string, fetch: Fetch) {
    this.hostname = hostname
    this.fetch = fetch
  }

  private url(name: string): string {
    return this.hostname + this.path + name
  }
  
  ping = (headers?: object): Promise<PingReturn> => {
    return this.fetch(
      this.url('Ping'),
      createHTTPRequest({}, headers)
      ).then((res) => {
      return buildResponse(res).then(_data => {
        return {
          status: <boolean>(_data.status)
        }
      })
    })
  }
  
  version = (headers?: object): Promise<VersionReturn> => {
    return this.fetch(
      this.url('Version'),
      createHTTPRequest({}, headers)
      ).then((res) => {
      return buildResponse(res).then(_data => {
        return {
          version: <Version>(_data.version)
        }
      })
    })
  }
  
  runtimeStatus = (headers?: object): Promise<RuntimeStatusReturn> => {
    return this.fetch(
      this.url('RuntimeStatus'),
      createHTTPRequest({}, headers)
      ).then((res) => {
      return buildResponse(res).then(_data => {
        return {
          status: <RuntimeStatus>(_data.status)
        }
      })
    })
  }
  
  etherBalance = (args: EtherBalanceArgs, headers?: object): Promise<EtherBalanceReturn> => {
    return this.fetch(
      this.url('EtherBalance'),
      createHTTPRequest(args, headers)).then((res) => {
      return buildResponse(res).then(_data => {
        return {
          balance: <EtherBalance>(_data.balance)
        }
      })
    })
  }
  
  contractBalanceOf = (args: ContractBalanceOfArgs, headers?: object): Promise<ContractBalanceOfReturn> => {
    return this.fetch(
      this.url('ContractBalanceOf'),
      createHTTPRequest(args, headers)).then((res) => {
      return buildResponse(res).then(_data => {
        return {
          status: <boolean>(_data.status), 
          balances: <Array<Balance>>(_data.balances)
        }
      })
    })
  }
  
  contractBalanceOfTokenIDs = (args: ContractBalanceOfTokenIDsArgs, headers?: object): Promise<ContractBalanceOfTokenIDsReturn> => {
    return this.fetch(
      this.url('ContractBalanceOfTokenIDs'),
      createHTTPRequest(args, headers)).then((res) => {
      return buildResponse(res).then(_data => {
        return {
          status: <boolean>(_data.status), 
          balances: <Array<Balance>>(_data.balances)
        }
      })
    })
  }
  
  contractBalanceSync = (args: ContractBalanceSyncArgs, headers?: object): Promise<ContractBalanceSyncReturn> => {
    return this.fetch(
      this.url('ContractBalanceSync'),
      createHTTPRequest(args, headers)).then((res) => {
      return buildResponse(res).then(_data => {
        return {
          status: <boolean>(_data.status), 
          balances: <Array<Balance>>(_data.balances)
        }
      })
    })
  }
  
  contractBalanceSyncTokenIDs = (args: ContractBalanceSyncTokenIDsArgs, headers?: object): Promise<ContractBalanceSyncTokenIDsReturn> => {
    return this.fetch(
      this.url('ContractBalanceSyncTokenIDs'),
      createHTTPRequest(args, headers)).then((res) => {
      return buildResponse(res).then(_data => {
        return {
          status: <boolean>(_data.status), 
          balances: <Array<Balance>>(_data.balances)
        }
      })
    })
  }
  
  contractCall = (args: ContractCallArgs, headers?: object): Promise<ContractCallReturn> => {
    return this.fetch(
      this.url('ContractCall'),
      createHTTPRequest(args, headers)).then((res) => {
      return buildResponse(res).then(_data => {
        return {
          returns: <Array<string>>(_data.returns)
        }
      })
    })
  }
  
}

  
export interface WebRPCError extends Error {
  code: string
  msg: string
	status: number
}

const createHTTPRequest = (body: object = {}, headers: object = {}): object => {
  return {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  }
}

const buildResponse = (res: Response): Promise<any> => {
  return res.text().then(text => {
    let data
    try {
      data = JSON.parse(text)
    } catch(err) {
      throw { code: 'unknown', msg: `expecting JSON, got: ${text}`, status: res.status } as WebRPCError
    }
    if (!res.ok) {
      throw data // webrpc error response
    }
    return data
  })
}

export type Fetch = (input: RequestInfo, init?: RequestInit) => Promise<Response>
