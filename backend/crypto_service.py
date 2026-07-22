"""AES-256-GCM belge şifreleme + RSA-OAEP anahtar sarma."""
from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def generate_rsa_keypair() -> tuple[str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    return public_pem, private_pem


def _load_public(pem: str):
    return serialization.load_pem_public_key(pem.encode("utf-8"))


def _load_private(pem: str):
    return serialization.load_pem_private_key(pem.encode("utf-8"), password=None)


def wrap_aes_key_with_rsa(aes_key: bytes, public_key_pem: str) -> str:
    public_key = _load_public(public_key_pem)
    wrapped = public_key.encrypt(
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return base64.b64encode(wrapped).decode("ascii")


def unwrap_aes_key_with_rsa(wrapped_b64: str, private_key_pem: str) -> bytes:
    private_key = _load_private(private_key_pem)
    wrapped = base64.b64decode(wrapped_b64.encode("ascii"))
    return private_key.decrypt(
        wrapped,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )


def encrypt_bytes_aes_gcm(plaintext: bytes) -> tuple[bytes, str, str]:
    """Döner: (ciphertext, aes_key_b64, nonce_b64)."""
    aes_key = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    ciphertext = AESGCM(aes_key).encrypt(nonce, plaintext, None)
    return (
        ciphertext,
        base64.b64encode(aes_key).decode("ascii"),
        base64.b64encode(nonce).decode("ascii"),
    )


def decrypt_bytes_aes_gcm(
    ciphertext: bytes, aes_key: bytes, nonce_b64: str
) -> bytes:
    nonce = base64.b64decode(nonce_b64.encode("ascii"))
    return AESGCM(aes_key).decrypt(nonce, ciphertext, None)
