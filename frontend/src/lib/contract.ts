import { Contract, BrowserProvider, JsonRpcProvider } from "ethers";
import { getActiveConfig } from "@/config/contracts";

export function getReadProvider(): JsonRpcProvider {
  const cfg = getActiveConfig();
  return new JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
}

export function getContractReadOnly(): Contract {
  const cfg = getActiveConfig();
  return new Contract(cfg.address, cfg.abi, getReadProvider());
}

export async function verifyOnChain(certHashHex: string): Promise<boolean> {
  const contract = getContractReadOnly();
  const bytes32 = certHashHex.startsWith("0x")
    ? certHashHex
    : `0x${certHashHex}`;
  return contract.verifyCertificate(bytes32);
}

async function gasOverrides(provider: BrowserProvider) {
  const cfg = getActiveConfig();
  const feeData = await provider.getFeeData();

  // Polygon Amoy RPC en az ~25 gwei priority fee ister
  const minTip =
    cfg.chainId === 80002 ? 25_000_000_000n : 1_000_000_000n;

  let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? minTip;
  if (maxPriorityFeePerGas < minTip) {
    maxPriorityFeePerGas = minTip;
  }

  let maxFeePerGas = feeData.maxFeePerGas ?? maxPriorityFeePerGas * 2n;
  if (maxFeePerGas < maxPriorityFeePerGas) {
    maxFeePerGas = maxPriorityFeePerGas * 2n;
  }

  return { maxPriorityFeePerGas, maxFeePerGas };
}

export async function addCertificateOnChain(
  provider: BrowserProvider,
  certHashHex: string
): Promise<string> {
  const cfg = getActiveConfig();
  const signer = await provider.getSigner();
  const contract = new Contract(cfg.address, cfg.abi, signer);
  const bytes32 = certHashHex.startsWith("0x")
    ? certHashHex
    : `0x${certHashHex}`;

  const overrides = await gasOverrides(provider);
  const tx = await contract.addCertificate(bytes32, overrides);
  const receipt = await tx.wait();
  return receipt?.hash ?? tx.hash;
}
