"""iyzico Checkout Form API."""
from __future__ import annotations

import json
import uuid
from typing import Any

import iyzipay

from payment_config import (
    BACKEND_PUBLIC_URL,
    IYZICO_API_KEY,
    IYZICO_BASE_URL,
    IYZICO_SECRET_KEY,
    PAYMENT_AMOUNT_TRY,
)


def _options() -> dict[str, str]:
    return {
        "api_key": IYZICO_API_KEY,
        "secret_key": IYZICO_SECRET_KEY,
        "base_url": IYZICO_BASE_URL,
    }


def _parse_response(raw) -> dict[str, Any]:
    if hasattr(raw, "read"):
        text = raw.read().decode("utf-8")
    else:
        text = str(raw)
    return json.loads(text)


def initialize_checkout(
    *,
    session_id: str,
    buyer_name: str,
    buyer_email: str,
    buyer_ip: str,
    filename: str,
) -> dict[str, Any]:
    """Ödeme sayfası URL'si veya hata döner."""
    price = PAYMENT_AMOUNT_TRY
    callback_url = f"{BACKEND_PUBLIC_URL}/payments/iyzico/callback"

    name_parts = (buyer_name or "Kullanici").strip().split(maxsplit=1)
    first_name = name_parts[0] if name_parts else "Kullanici"
    last_name = name_parts[1] if len(name_parts) > 1 else "Kullanici"

    request = {
        "locale": "tr",
        "conversationId": session_id,
        "price": price,
        "paidPrice": price,
        "currency": "TRY",
        "basketId": session_id[:32],
        "paymentGroup": "PRODUCT",
        "callbackUrl": callback_url,
        "enabledInstallments": [1],
        "buyer": {
            "id": session_id[:20],
            "name": first_name,
            "surname": last_name,
            "gsmNumber": "+905350000000",
            "email": buyer_email,
            "identityNumber": "11111111111",
            "lastLoginDate": "2025-01-01 12:00:00",
            "registrationDate": "2025-01-01 12:00:00",
            "registrationAddress": "Turkiye",
            "ip": buyer_ip or "127.0.0.1",
            "city": "Zonguldak",
            "country": "Turkey",
            "zipCode": "67000",
        },
        "shippingAddress": {
            "contactName": buyer_name or "Kullanici",
            "city": "Zonguldak",
            "country": "Turkey",
            "address": "BEUN Etherescan",
            "zipCode": "67000",
        },
        "billingAddress": {
            "contactName": buyer_name or "Kullanici",
            "city": "Zonguldak",
            "country": "Turkey",
            "address": "BEUN Etherescan",
            "zipCode": "67000",
        },
        "basketItems": [
            {
                "id": "DOC_SEAL",
                "name": f"Belge muhurleme: {filename[:40]}",
                "category1": "Dijital Hizmet",
                "category2": "Belge",
                "itemType": "VIRTUAL",
                "price": price,
            }
        ],
    }

    raw = iyzipay.CheckoutFormInitialize().create(request, _options())
    return _parse_response(raw)


def retrieve_checkout(token: str, conversation_id: str) -> dict[str, Any]:
    request = {
        "locale": "tr",
        "conversationId": conversation_id,
        "token": token,
    }
    raw = iyzipay.CheckoutForm().retrieve(request, _options())
    return _parse_response(raw)


def mock_checkout_url(session_id: str) -> str:
    """Yerel geliştirme: doğrudan callback simülasyonu."""
    token = f"mock-{uuid.uuid4().hex}"
    return f"{BACKEND_PUBLIC_URL}/payments/iyzico/mock-complete?session={session_id}&token={token}"
