"""Sunucu cüzdanı ile Polygon üzerinde belge mühürleme."""
from __future__ import annotations

import json
from pathlib import Path

from payment_config import (
    CHAIN_ID,
    CONTRACT_ADDRESS,
    CONTRACTS_JSON,
    RELAYER_PRIVATE_KEY,
    RPC_URL,
)


def _load_contract_config() -> dict:
    if CONTRACTS_JSON.is_file():
        with CONTRACTS_JSON.open(encoding="utf-8") as f:
            return json.load(f)
    return {
        "address": CONTRACT_ADDRESS,
        "chainId": CHAIN_ID,
        "rpcUrl": RPC_URL,
        "abi": [],
    }


def _get_web3():
    try:
        from web3 import Web3
    except ImportError as e:
        raise RuntimeError("web3 paketi gerekli: pip install web3") from e

    cfg = _load_contract_config()
    rpc = RPC_URL or cfg.get("rpcUrl")
    if not rpc:
        raise RuntimeError("RPC_URL veya contracts.json içinde rpcUrl gerekli")
    return Web3(Web3.HTTPProvider(rpc)), cfg


def hash_to_bytes32(file_hash_hex: str) -> bytes:
    h = (file_hash_hex or "").strip().lower().replace("0x", "")
    if len(h) != 64:
        raise ValueError("Gecersiz SHA-256 hash")
    return bytes.fromhex(h)


def is_certificate_on_chain(file_hash_hex: str) -> bool:
    from web3 import Web3

    w3, cfg = _get_web3()
    address = CONTRACT_ADDRESS or cfg.get("address")
    if not address or not cfg.get("abi"):
        return False
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(address),
        abi=cfg["abi"],
    )
    cert = hash_to_bytes32(file_hash_hex)
    return bool(contract.functions.verifyCertificate(cert).call())


def seal_certificate_on_chain(file_hash_hex: str) -> str:
    """addCertificate çağırır; işlem hash'ini döner."""
    if not RELAYER_PRIVATE_KEY:
        raise RuntimeError("RELAYER_PRIVATE_KEY .env dosyasinda tanimli degil")

    try:
        from eth_account import Account
        from web3 import Web3
    except ImportError as e:
        raise RuntimeError("web3 ve eth-account gerekli") from e

    w3, cfg = _get_web3()
    address = CONTRACT_ADDRESS or cfg.get("address")
    if not address:
        raise RuntimeError("Kontrat adresi bulunamadi")
    if not cfg.get("abi"):
        raise RuntimeError("Kontrat ABI bulunamadi (contracts.json)")

    account = Account.from_key(RELAYER_PRIVATE_KEY)
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(address),
        abi=cfg["abi"],
    )
    cert = hash_to_bytes32(file_hash_hex)
    chain_id = CHAIN_ID or int(cfg.get("chainId") or 80002)

    if contract.functions.verifyCertificate(cert).call():
        raise ValueError("Bu belge zaten blockchain'de kayitli")

    nonce = w3.eth.get_transaction_count(account.address)
    min_tip = w3.to_wei(25, "gwei") if chain_id == 80002 else w3.to_wei(1, "gwei")

    try:
        latest = w3.eth.get_block("latest")
        base_fee = latest.get("baseFeePerGas") or w3.to_wei(30, "gwei")
    except Exception:
        base_fee = w3.to_wei(30, "gwei")

    max_priority = min_tip
    max_fee = base_fee * 2 + max_priority

    tx = contract.functions.addCertificate(cert).build_transaction(
        {
            "from": account.address,
            "nonce": nonce,
            "chainId": chain_id,
            "maxFeePerGas": max_fee,
            "maxPriorityFeePerGas": max_priority,
        }
    )

    try:
        estimated = w3.eth.estimate_gas(tx)
        tx["gas"] = int(estimated * 1.2)
    except Exception:
        tx["gas"] = 300_000

    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
    if receipt.get("status") != 1:
        raise RuntimeError("Blockchain islemi basarisiz")
    return receipt["transactionHash"].hex()
