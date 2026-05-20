/**
 * EthdocsRegistry ile etkileşim — window.ETHERDOCS_CONFIG (constants.js) kullanır.
 */

/** Birden fazla cüzdan (Trust + MetaMask vb.) yüklüyse MetaMask’ı tercih et. */
function getEthereumProvider() {
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    const mm = eth.providers.find((p) => p.isMetaMask);
    if (mm) return mm;
  }
  if (eth.isMetaMask) return eth;
  return eth;
}

const BlockchainService = {
  _provider: null,
  _signer: null,
  _contract: null,
  _connectPromise: null,

  getConfig() {
    if (!window.ETHERDOCS_CONFIG) {
      throw new Error(
        "Kontrat yapılandırması bulunamadı. etherdocs-contracts içinde npm run setup:local çalıştırın."
      );
    }
    return window.ETHERDOCS_CONFIG;
  },

  async _requestAccounts(eth) {
    const existing = await eth.request({ method: "eth_accounts" });
    if (existing && existing.length > 0) {
      return existing;
    }
    try {
      return await eth.request({ method: "eth_requestAccounts" });
    } catch (err) {
      const code = err?.code ?? err?.data?.code;
      if (code === -32002) {
        throw new Error(
          "MetaMask'ta bekleyen bir istek var. Açık MetaMask penceresini onaylayın veya iptal edin, sonra tekrar deneyin."
        );
      }
      throw err;
    }
  },

  async connect() {
    if (this._connectPromise) {
      return this._connectPromise;
    }

    this._connectPromise = this._doConnect();
    try {
      return await this._connectPromise;
    } finally {
      this._connectPromise = null;
    }
  },

  async _doConnect() {
    const config = this.getConfig();

    const eth = getEthereumProvider();
    if (!eth) {
      throw new Error(
        "MetaMask veya uyumlu bir cüzdan bulunamadı. MetaMask yüklü mü kontrol edin."
      );
    }

    this._provider = new ethers.BrowserProvider(eth);
    await this._requestAccounts(eth);

    let network = await this._provider.getNetwork();
    const targetChain = config.CHAIN_ID;
    if (Number(network.chainId) !== targetChain) {
      const chainHex = "0x" + targetChain.toString(16);
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainHex }],
        });
      } catch (switchErr) {
        if (switchErr?.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: chainHex,
                chainName: "Hardhat Local",
                rpcUrls: [config.RPC_URL],
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              },
            ],
          });
        } else {
          throw new Error(
            `Yanlış ağ. Beklenen chainId: ${targetChain}, mevcut: ${network.chainId}. MetaMask'ta Hardhat Local (31337) seçin.`
          );
        }
      }
      network = await this._provider.getNetwork();
    }

    this._signer = await this._provider.getSigner();
    this._contract = new ethers.Contract(
      config.CONTRACT_ADDRESS,
      config.CONTRACT_ABI,
      this._signer
    );

    return this._signer.getAddress();
  },

  hexToBytes32(hexHash) {
    if (hexHash.startsWith("0x") && hexHash.length === 66) {
      return hexHash;
    }
    return "0x" + hexHash.replace(/^0x/, "").padStart(64, "0").slice(-64);
  },

  async addCertificate(fileHashHex) {
    if (!this._contract) {
      await this.connect();
    }

    const certHash = this.hexToBytes32(fileHashHex);
    const tx = await this._contract.addCertificate(certHash);
    const receipt = await tx.wait();
    return receipt.hash;
  },

  async verifyCertificate(fileHashHex) {
    const config = this.getConfig();
    const provider = this._provider ?? new ethers.JsonRpcProvider(config.RPC_URL);
    const contract = new ethers.Contract(
      config.CONTRACT_ADDRESS,
      config.CONTRACT_ABI,
      provider
    );

    const certHash = this.hexToBytes32(fileHashHex);
    return contract.verifyCertificate(certHash);
  },
};

window.BlockchainService = BlockchainService;
