export function parseBlockchainError(error: unknown): string {
  const e = error as {
    reason?: string;
    shortMessage?: string;
    message?: string;
    code?: string;
  };

  const text = [
    e.reason,
    e.shortMessage,
    e.message,
    String(error),
  ]
    .filter(Boolean)
    .join(" ");

  if (text.includes("Sertifika zaten kayitli")) {
    return "Bu belge zaten blockchain'de kayıtlı. Üst bölümden doğrulayabilirsiniz.";
  }
  if (text.includes("insufficient funds")) {
    return "Yetersiz bakiye. Polygon Amoy test POL alın (faucet).";
  }
  if (
    text.includes("gas price below minimum") ||
    text.includes("gas tip cap") ||
    text.includes("minimum needed")
  ) {
    return (
      "İşlem ücreti ağ için çok düşük. MetaMask'ta Polygon Amoy seçili olsun ve tekrar deneyin."
    );
  }
  if (text.includes("could not coalesce")) {
    return (
      "İşlem reddedildi veya başarısız. MetaMask'ta Polygon Amoy ağını seçin; Hardhat Local değil."
    );
  }
  if (text.includes("user rejected") || e.code === "ACTION_REJECTED") {
    return "İşlem MetaMask'ta reddedildi.";
  }
  if (
    text.includes("network") ||
    text.includes("NETWORK_ERROR") ||
    text.includes("yanlış ağ")
  ) {
    return "Ağ hatası. MetaMask'ta Polygon Amoy (80002) seçin.";
  }

  return e.shortMessage ?? e.message ?? "Blockchain işlemi başarısız.";
}
