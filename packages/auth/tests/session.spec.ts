import { deployWalletContext } from './utils/deploy-wallet-context'
import { delay, mockDate } from './utils'

import { CallReceiverMock, HookCallerMock } from '@0xsequence/wallet-contracts'

import { LocalRelayer } from '@0xsequence/relayer'

import { WalletContext, Networks, NetworkConfig } from '@0xsequence/network'
import { JsonRpcProvider } from '@ethersproject/providers'
import { ethers, Signer as AbstractSigner } from 'ethers'

import chaiAsPromised from 'chai-as-promised'
import * as chai from 'chai'

const CallReceiverMockArtifact = require('@0xsequence/wallet-contracts/artifacts/contracts/mocks/CallReceiverMock.sol/CallReceiverMock.json')
const HookCallerMockArtifact = require('@0xsequence/wallet-contracts/artifacts/contracts/mocks/HookCallerMock.sol/HookCallerMock.json')

const { expect } = chai.use(chaiAsPromised)

import { Session, ValidateSequenceDeployedWalletProof, ValidateSequenceUndeployedWalletProof } from '../src'
import { compareAddr } from '@0xsequence/config'

import * as mockServer from "mockttp"
import { ETHAuth } from '@0xsequence/ethauth'

type EthereumInstance = {
  chainId?: number
  providerUrl?: string,
  provider?: JsonRpcProvider
  signer?: AbstractSigner
}

class CountingSigner extends AbstractSigner {
  private _signingRequests: number = 0

  constructor(private readonly signer: AbstractSigner) {
    super()
  }

  get signingRequests(): number {
    return this._signingRequests
  }

  getAddress(): Promise<string> {
    return this.signer.getAddress()
  }

  signMessage(message: ethers.Bytes | string): Promise<string> {
    this._signingRequests++
    return this.signer.signMessage(message)
  }

  signTransaction(transaction: ethers.utils.Deferrable<ethers.providers.TransactionRequest>): Promise<string> {
    this._signingRequests++
    return this.signer.signTransaction(transaction)
  }

  connect(provider: ethers.providers.Provider): ethers.Signer {
    return this.signer.connect(provider)
  }
}

async function initialAuthToFinish(session: Session): Promise<void> {
  await Promise.allSettled(session._initialAuthRequests)
}

function hasTokenForURL(session: Session, url: string): boolean {
  return session._jwts.has(url)
}

function getTokenForURL(session: Session, url: string): Promise<string | undefined> {
  return session._jwts.get(url)?.token
}

describe('Wallet integration', function () {
  const ethnode: EthereumInstance = {}

  let relayer: LocalRelayer
  let callReceiver: CallReceiverMock
  let hookCaller: HookCallerMock

  let context: WalletContext
  let networks: Networks

  before(async () => {
    // Provider from hardhat without a server instance
    ethnode.providerUrl = `http://localhost:9546/`
    ethnode.provider = new ethers.providers.JsonRpcProvider(ethnode.providerUrl)

    ethnode.signer = ethnode.provider.getSigner()
    ethnode.chainId = 31337

    // Deploy local relayer
    relayer = new LocalRelayer(ethnode.signer)

    networks = [{
      name: 'local',
      chainId: ethnode.chainId,
      provider: ethnode.provider,
      isDefaultChain: true,
      isAuthChain: true,
      relayer: relayer
    }] as NetworkConfig[]

    // Deploy Sequence env
    const [
      factory,
      mainModule,
      mainModuleUpgradable,
      guestModule,
      sequenceUtils
    ] = await deployWalletContext(ethnode.provider)

    // Create fixed context obj
    context = {
      factory: factory.address,
      mainModule: mainModule.address,
      mainModuleUpgradable: mainModuleUpgradable.address,
      guestModule: guestModule.address,
      sequenceUtils: sequenceUtils.address
    }

    // Deploy call receiver mock
    callReceiver = (await new ethers.ContractFactory(
      CallReceiverMockArtifact.abi,
      CallReceiverMockArtifact.bytecode,
      ethnode.signer
    ).deploy()) as CallReceiverMock

    // Deploy hook caller mock
    hookCaller = (await new ethers.ContractFactory(
      HookCallerMockArtifact.abi,
      HookCallerMockArtifact.bytecode,
      ethnode.signer
    ).deploy()) as HookCallerMock
  })

  it('Should open a new session', async () => {
    const referenceSigner = ethers.Wallet.createRandom()

    const session = await Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }],
      thershold: 1,
      metadata: {
        name: "Test"
      }
    })

    expect(session.account.address).to.not.equal(ethers.constants.AddressZero)
    expect(session.config.address).to.be.undefined
    expect(session.config.threshold).to.equal(1)
    expect(session.config.signers.length).to.equal(1)
    expect(session.config.signers[0].address).to.equal(referenceSigner.address)
    expect(session.config.signers[0].weight).to.equal(1)

    await session.account.sendTransaction({ to: referenceSigner.address })
  })

  it("Should dump and load a session", async () => {
    const referenceSigner = ethers.Wallet.createRandom()

    let session = await Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }],
      thershold: 1,
      metadata: {
        name: "Test"
      }
    })

    const dump = await session.dump()

    session = Session.load({
      dump: dump,
      signers: [referenceSigner],
      networks: networks
    })

    await session.account.sendTransaction({ to: referenceSigner.address })
  })

  it("Should open an existing session", async () => {
    const referenceSigner = ethers.Wallet.createRandom()

    const ogSession = await Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }],
      thershold: 1,
      metadata: {
        name: "Test"
      }
    })

    const newSigner = ethers.Wallet.createRandom()

    const session = await Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }, { signer: newSigner, weight: 1 }],
      thershold: 2,
      metadata: {
        name: "Test"
      }
    })

    const [ogSignerId, signerId] = compareAddr(referenceSigner.address, newSigner.address) === 1 ? [1, 0] : [0, 1]

    expect(session.account.address).to.equal(ogSession.account.address)
    expect(session.config.threshold).to.equal(2)
    expect(session.config.signers.length).to.equal(2)
    expect(session.config.signers[ogSignerId].address).to.equal(referenceSigner.address)
    expect(session.config.signers[ogSignerId].weight).to.equal(1)
    expect(session.config.signers[signerId].address).to.equal(newSigner.address)
    expect(session.config.signers[signerId].weight).to.equal(1)
  })

  it("Should open an existing session with one signer being an public address", async () => {
    const referenceSigner = ethers.Wallet.createRandom()

    const ogSession = await Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }],
      thershold: 1,
      metadata: {
        name: "Test"
      }
    })

    const newSigner = ethers.Wallet.createRandom()

    const session = await Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }, { signer: newSigner.address, weight: 1 }],
      thershold: 1,
      metadata: {
        name: "Test"
      }
    })

    const [ogSignerId, signerId] = compareAddr(referenceSigner.address, newSigner.address) === 1 ? [1, 0] : [0, 1]

    expect(session.account.address).to.equal(ogSession.account.address)
    expect(session.config.threshold).to.equal(1)
    expect(session.config.signers.length).to.equal(2)
    expect(session.config.signers[ogSignerId].address).to.equal(referenceSigner.address)
    expect(session.config.signers[ogSignerId].weight).to.equal(1)
    expect(session.config.signers[signerId].address).to.equal(newSigner.address)
    expect(session.config.signers[signerId].weight).to.equal(1)
  })

  it("Should fail open an existing session with all signers being public addresses", async () => {
    const referenceSigner = ethers.Wallet.createRandom()

    const newSigner = ethers.Wallet.createRandom()

    const sessionPromise = Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner.address, weight: 1 }, { signer: newSigner.address, weight: 1 }],
      thershold: 1,
      metadata: {
        name: "Test"
      }
    })

    expect(sessionPromise).to.be.rejected
  })

  it("Should open session without index and using deepSearch", async () => {
    const referenceSigner = ethers.Wallet.createRandom()

    const ogSession = await Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }],
      thershold: 1,
      metadata: {
        name: "Test"
      },
      noIndex: true
    })

    const newSigner = ethers.Wallet.createRandom()

    const session = await Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }, { signer: newSigner, weight: 1 }],
      thershold: 2,
      metadata: {
        name: "Test"
      },
      noIndex: true,
      deepSearch: true
    })

    expect(ogSession.account.address).to.equal(session.account.address)
  })

  it("Should fail to open session without authChain", async () => {
    const referenceSigner = ethers.Wallet.createRandom()

    const sessionPromise = Session.open({
      context: context,
      networks: [{ ...networks[0], isAuthChain: false }],
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }],
      thershold: 1,
      metadata: {
        name: "Test"
      }
    })

    expect(sessionPromise).to.be.rejected
  })

  it("Should open a different session if noIndex and deepSearch are not equal", async () => {
    const referenceSigner = ethers.Wallet.createRandom()

    const ogSession = await Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }],
      thershold: 1,
      metadata: {
        name: "Test"
      },
      noIndex: true
    })

    const newSigner = ethers.Wallet.createRandom()

    const session = await Session.open({
      context: context,
      networks: networks,
      referenceSigner: referenceSigner.address,
      signers: [{ signer: referenceSigner, weight: 1 }, { signer: newSigner, weight: 1 }],
      thershold: 2,
      metadata: {
        name: "Test"
      },
      noIndex: true,
      deepSearch: false
    })

    expect(ogSession.account.address).to.not.equal(session.account.address)
  })

  describe('JWT Auth', () => {
    let server: mockServer.Mockttp
    let networksWithApi: NetworkConfig[]
    let fakeJwt: string
    let proofAddress: string

    let delayMs: number = 0

    let totalCount: number = 0
    let recoverCount: { [address: string]: number } = {}

    let alwaysFail: boolean = false

    const sequenceApiUrl = "http://localhost:8099"

    beforeEach(() => {
      networksWithApi = [{
        ...networks[0],
        sequenceApiUrl: sequenceApiUrl
      }] as NetworkConfig[]

      fakeJwt = ethers.utils.hexlify(ethers.utils.randomBytes(64))

      server = mockServer.getLocal()
      server.start(8099)

      server.post('/rpc/ArcadeumAPI/GetAuthToken').thenCallback(async (request) => {
        if (delayMs !== 0) await delay(delayMs)

        const ethauth = new ETHAuth(
          ValidateSequenceUndeployedWalletProof(context),
          ValidateSequenceDeployedWalletProof
        )

        ethauth.chainId = ethnode.chainId
        ethauth.configJsonRpcProvider(ethnode.providerUrl)

        totalCount++

        if (alwaysFail) return { statusCode: 400 }

        try {
          const proof = await ethauth.decodeProof(request.body.json['ewtString'])
          proofAddress = ethers.utils.getAddress(proof.address)

          if (recoverCount[proofAddress]) {
            recoverCount[proofAddress]++
          } else {
            recoverCount[proofAddress] = 1
          }

          return {
            statusCode: 200,
            body: JSON.stringify({
              status: true,
              jwtToken: fakeJwt
            })
          }
        } catch {
          if (recoverCount["error"]) {
            recoverCount["error"]++
          } else {
            recoverCount["error"] = 1
          }

          return {
            statusCode: 401
          }
        }
      })
    })

    afterEach(() => {
      server.stop()
      delayMs = 0
      totalCount = 0
      recoverCount = {}
      alwaysFail = false
    })

    it("Should get JWT token", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      await session.auth(networksWithApi[0])
      expect(totalCount).to.equal(1)
      expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)
      expect(proofAddress).to.equal(session.account.address)
    })

    it("Should get JWT token (using network number)", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networksWithApi,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      await session.auth(ethnode.chainId)
      expect(totalCount).to.equal(1)
      expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)
      expect(proofAddress).to.equal(session.account.address)
    })

    it("Should fail to get JWT token (using non-existing network)", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networksWithApi,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      const auth = session.auth({
        name: 'mainnet',
        chainId: 1
      })

      await expect(auth).to.be.rejected
    })

    it("Should fail to get JWT token (using non-existing network number)", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      const auth = session.auth(1)

      await expect(auth).to.be.rejected
    })

    it("Should get JWT after updating session", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      const newSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }, { signer: newSigner, weight: 1 }],
        thershold: 2,
        metadata: {
          name: "Test"
        }
      })

      await session.auth(networksWithApi[0])
      await initialAuthToFinish(session)

      expect(totalCount).to.equal(1)
      expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)
      expect(proofAddress).to.equal(session.account.address)
    })

    it("Should get JWT during first session creation", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networksWithApi,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      expect(session._initialAuthRequests.length).to.equal(networksWithApi.length)
      await initialAuthToFinish(session)

      expect(totalCount).to.equal(1)
      expect(recoverCount[session.account.address]).to.equal(1)

      expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)
    })

    it("Should get JWT during session opening", async () => {
      delayMs = 500

      const referenceSigner = ethers.Wallet.createRandom()

      let session = await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      await initialAuthToFinish(session)

      const newSigner = ethers.Wallet.createRandom()

      session = await Session.open({
        context: context,
        networks: networksWithApi,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }, { signer: newSigner, weight: 1 }],
        thershold: 2,
        metadata: {
          name: "Test"
        }
      })

      expect(session._initialAuthRequests.length).to.equal(networksWithApi.length)
      await initialAuthToFinish(session)

      expect(totalCount).to.equal(1)
      // TODO: can't reproduce
      // expect(recoverCount["error"]).to.equal(1)
      expect(recoverCount[session.account.address]).to.equal(1)

      expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)
    })

    it("Should get API with lazy JWT during first session creation", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      const api = await session.getAPI(networksWithApi[0])

      expect(totalCount).to.equal(1)
      expect(recoverCount[session.account.address]).to.equal(1)

      expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)

      server.post('/rpc/ArcadeumAPI/FriendList').thenCallback(async (request) => {
        const hasToken = request.headers['authorization'].includes(fakeJwt)
        return { statusCode: hasToken ? 200 : 401, body: JSON.stringify({}) }
      })

      await api.friendList({ page: {} })
    })

    it("Should get API with lazy JWT during session opening", async () => {
      delayMs = 500
      const referenceSigner = ethers.Wallet.createRandom()

      await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      const newSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }, { signer: newSigner, weight: 1 }],
        thershold: 2,
        metadata: {
          name: "Test"
        }
      })

      const api = await session.getAPI(networksWithApi[0])

      expect(totalCount).to.equal(1)
      expect(recoverCount[session.account.address]).to.equal(1)

      expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)

      server.post('/rpc/ArcadeumAPI/FriendList').thenCallback(async (request) => {
        const hasToken = request.headers['authorization'].includes(fakeJwt)
        return { statusCode: hasToken ? 200 : 401, body: JSON.stringify({}) }
      })

      await api.friendList({ page: {} })
    })

    it("Should call callbacks on JWT token", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networksWithApi,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      let calledCallback = 0
      session.onAuth(() => calledCallback++)

      await initialAuthToFinish(session)

      expect(calledCallback).to.equal(1)
    })

    it("Should call callbacks on JWT token (on open only once)", async () => {
      delayMs = 500

      const referenceSigner = ethers.Wallet.createRandom()

      await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      const newSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networksWithApi,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }, { signer: newSigner, weight: 1 }],
        thershold: 2,
        metadata: {
          name: "Test"
        }
      })

      let calledCallback = 0
      session.onAuth(() => calledCallback++)

      await initialAuthToFinish(session)

      expect(calledCallback).to.equal(1)
    })

    it("Should retry 5 times retrieving the JWT token", async () => {
      delayMs = 1000
      const referenceSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      alwaysFail = true
      const auth = session.auth(networksWithApi[0])
      await expect(auth).to.be.rejected
      expect(totalCount).to.equal(5)
      expect(hasTokenForURL(session, sequenceApiUrl)).to.be.false
    })

    it("Should get API with JWT already present", async () => {
      delayMs = 500
      const referenceSigner = ethers.Wallet.createRandom()

      await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      const newSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networksWithApi,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }, { signer: newSigner, weight: 1 }],
        thershold: 2,
        metadata: {
          name: "Test"
        }
      })

      await initialAuthToFinish(session)

      const totalCountBefore = totalCount

      // This should use the already existing JWT
      const api = await session.getAPI(networksWithApi[0])

      expect(totalCount).to.equal(totalCountBefore)
      // TODO: can't reproduce
      // expect(recoverCount["error"]).to.equal(1)
      expect(recoverCount[session.account.address]).to.equal(1)

      expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)

      server.post('/rpc/ArcadeumAPI/FriendList').thenCallback(async (request) => {
        const hasToken = request.headers['authorization'].includes(fakeJwt)
        return { statusCode: hasToken ? 200 : 401, body: JSON.stringify({}) }
      })

      await api.friendList({ page: {} })
    })

    it("Should fail to get API with false tryAuth and no JWT", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      alwaysFail = true

      const session = await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      await initialAuthToFinish(session)

      alwaysFail = false

      const apiPromise = session.getAPI(networksWithApi[0], false)

      await expect(apiPromise).to.be.rejected

      expect(totalCount).to.equal(0)
      expect(hasTokenForURL(session, sequenceApiUrl)).to.be.false
    })

    it("Should fail to get API without api url", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      const apiPromise = session.getAPI(ethnode.chainId)

      await expect(apiPromise).to.be.rejected

      expect(totalCount).to.equal(0)
      expect(hasTokenForURL(session, sequenceApiUrl)).to.be.false
    })

    it("Should fail to get JWT with no api configured", async () => {
      const referenceSigner = ethers.Wallet.createRandom()

      const session = await Session.open({
        context: context,
        networks: networks,
        referenceSigner: referenceSigner.address,
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: "Test"
        }
      })

      const authPromise = session.auth(ethnode.chainId)

      await expect(authPromise).to.be.rejected

      expect(totalCount).to.equal(0)
      expect(hasTokenForURL(session, sequenceApiUrl)).to.be.false
    })

    it('Should reuse outstanding JWT requests', async () => {
      const referenceSigner = new CountingSigner(ethers.Wallet.createRandom())

      alwaysFail = true

      const session = await Session.open({
        context,
        networks: networksWithApi,
        referenceSigner: await referenceSigner.getAddress(),
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: 'Test'
        }
      })

      // 2 signatures are made to publish signers
      expect(referenceSigner.signingRequests).to.equal(2)

      const signingRequestsBefore = referenceSigner.signingRequests

      await initialAuthToFinish(session)

      alwaysFail = false
      totalCount = 0

      // Create a bunch of API clients concurrently
      const requests = []
      while (requests.length < 10) {
        requests.push(session.getAPI(networksWithApi[0]))
      }
      await expect(Promise.all(requests)).to.be.fulfilled

      expect(totalCount).to.equal(1)
      expect(referenceSigner.signingRequests).to.equal(signingRequestsBefore + 1)
    })

    it('Should reuse existing proof signatures', async () => {
      const referenceSigner = new CountingSigner(ethers.Wallet.createRandom())

      alwaysFail = true

      const session = await Session.open({
        context,
        networks: networksWithApi,
        referenceSigner: await referenceSigner.getAddress(),
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: 'Test'
        }
      })

      // 2 signatures are made to publish signers
      expect(referenceSigner.signingRequests).to.equal(2)

      const signingRequestsBefore = referenceSigner.signingRequests

      await initialAuthToFinish(session)

      totalCount = 0

      // Create a bunch of API clients sequentially
      for (let i = 0; i < 10; i++) {
        await expect(session.getAPI(networksWithApi[0])).to.be.rejected
      }

      expect(totalCount).to.equal(10)
      expect(referenceSigner.signingRequests).to.equal(signingRequestsBefore + 1)
    })

    it('Should neither re-authenticate nor retry if request succeeds', async () => {
      const referenceSigner = new CountingSigner(ethers.Wallet.createRandom())

      const session = await Session.open({
        context,
        networks: networksWithApi,
        referenceSigner: await referenceSigner.getAddress(),
        signers: [{ signer: referenceSigner, weight: 1 }],
        thershold: 1,
        metadata: {
          name: 'Test'
        }
      })

      await initialAuthToFinish(session)

      const api = await session.getAPI(networksWithApi[0])

      const okResponses = [true]
      server.post('/rpc/ArcadeumAPI/FriendList').thenCallback(async () => {
        return { statusCode: okResponses.shift() ? 200 : 401, body: JSON.stringify({}) }
      })

      totalCount = 0

      await expect(api.friendList({ page: {} })).to.be.fulfilled

      // no re-authentication since it succeeded
      expect(totalCount).to.equal(0)
    })

    describe('With expiration', () => {
      let resetDateMock : Function | undefined

      const setDate = (seconds: number) => {
        if (resetDateMock) resetDateMock()
        const newMockDate = new Date()
        newMockDate.setTime(seconds * 1000)
        resetDateMock = mockDate(newMockDate)
      }

      afterEach(() => {
        if (resetDateMock) resetDateMock()
      })

      it("Should request a new JWT after expiration", async () => {
        const baseTime = 1613579057
        setDate(baseTime)

        const referenceSigner = ethers.Wallet.createRandom()

        const session = await Session.open({
          context: context,
          networks: networksWithApi,
          referenceSigner: referenceSigner.address,
          signers: [{ signer: referenceSigner, weight: 1 }],
          thershold: 1,
          metadata: {
            name: "Test",
            expiration: 240
          }
        })

        await initialAuthToFinish(session)

        expect(totalCount).to.equal(1)
        expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)
        expect(session._jwts.get(sequenceApiUrl)?.expiration).to.equal(baseTime + 240 - 60)

        // Force expire (1 hour)
        const newBaseTime = baseTime + (60 * 60)
        setDate(newBaseTime)

        fakeJwt = ethers.utils.hexlify(ethers.utils.randomBytes(96))

        await session.getAPI(networksWithApi[0])

        expect(totalCount).to.equal(2)
        expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)
        expect(session._jwts.get(sequenceApiUrl)?.expiration).to.equal(newBaseTime + 240 - 60)
      })

      it("Should force min expiration time", async () => {
        const baseTime = 1613579057
        setDate(baseTime)

        const referenceSigner = ethers.Wallet.createRandom()

        const session = await Session.open({
          context: context,
          networks: networksWithApi,
          referenceSigner: referenceSigner.address,
          signers: [{ signer: referenceSigner, weight: 1 }],
          thershold: 1,
          metadata: {
            name: "Test",
            expiration: 1
          }
        })

        await initialAuthToFinish(session)

        expect(totalCount).to.equal(1)
        expect(await getTokenForURL(session, sequenceApiUrl)).to.equal(fakeJwt)
        expect(session._jwts.get(sequenceApiUrl)?.expiration).to.equal(baseTime + 120 - 60)
      })
    })
  })
})
