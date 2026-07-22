"""Ödeme ve relayer ortam değişkenleri."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACTS_JSON = ROOT / "frontend" / "config" / "contracts.json"

PAYMENT_AMOUNT_TRY = os.getenv("PAYMENT_AMOUNT_TRY", "50.0")
IYZICO_API_KEY = os.getenv("IYZICO_API_KEY", "").strip()
IYZICO_SECRET_KEY = os.getenv("IYZICO_SECRET_KEY", "").strip()
IYZICO_BASE_URL = os.getenv(
    "IYZICO_BASE_URL", "https://sandbox-api.iyzipay.com"
).strip().rstrip("/")

BACKEND_PUBLIC_URL = os.getenv(
    "BACKEND_PUBLIC_URL", "http://127.0.0.1:5000"
).strip().rstrip("/")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/")

RELAYER_PRIVATE_KEY = os.getenv("RELAYER_PRIVATE_KEY", "").strip()
CONTRACT_ADDRESS = os.getenv("VITE_CONTRACT_ADDRESS", "").strip()
RPC_URL = os.getenv("VITE_RPC_URL", "").strip()
CHAIN_ID = int(os.getenv("VITE_CHAIN_ID", "0") or "0")

# Geliştirme: gerçek iyzico olmadan ödeme simülasyonu (sadece yerel)
IYZICO_MOCK = os.getenv("IYZICO_MOCK", "").lower() in ("1", "true", "yes")


def iyzico_configured() -> bool:
    return bool(IYZICO_API_KEY and IYZICO_SECRET_KEY)


def relayer_configured() -> bool:
    return bool(RELAYER_PRIVATE_KEY)
