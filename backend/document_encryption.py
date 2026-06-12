"""Kurum onayında belgeyi AES ile şifreler, AES anahtarını RSA ile sarar."""
from __future__ import annotations

import base64
from pathlib import Path

from crypto_service import (
    decrypt_bytes_aes_gcm,
    encrypt_bytes_aes_gcm,
    unwrap_aes_key_with_rsa,
    wrap_aes_key_with_rsa,
)
from database import institution_code_variants
from file_storage import (
    delete_plain_document_file,
    find_stored_file,
    read_encrypted_document,
    write_encrypted_document,
)


def _is_sqlite(conn) -> bool:
    return conn.__class__.__module__.startswith("sqlite3")


def get_institution_rsa_keys(conn, institution_code: str) -> tuple[str, str] | None:
    cur = conn.cursor()
    ph = "?" if _is_sqlite(conn) else "%s"
    for code in institution_code_variants(institution_code):
        cur.execute(
            f"""
            SELECT rsa_public_key_pem, rsa_private_key_pem
            FROM institutions
            WHERE code = {ph}
            """,
            (code,),
        )
        row = cur.fetchone()
        if row and row[0] and row[1]:
            cur.close()
            return str(row[0]), str(row[1])
    cur.close()
    return None


def document_encryption_meta(conn, doc_id: int) -> dict | None:
    cur = conn.cursor()
    ph = "?" if _is_sqlite(conn) else "%s"
    cur.execute(
        f"""
        SELECT is_encrypted, encrypted_aes_key, aes_nonce, target_institution, filename, file_hash
        FROM documents WHERE id = {ph}
        """,
        (doc_id,),
    )
    row = cur.fetchone()
    cur.close()
    if not row:
        return None
    return {
        "is_encrypted": bool(row[0]),
        "encrypted_aes_key": row[1],
        "aes_nonce": row[2],
        "target_institution": row[3],
        "filename": row[4],
        "file_hash": row[5],
    }


def seal_document_on_approval(conn, doc_id: int) -> None:
    """Onay sonrası: düz PDF -> AES şifreli dosya, anahtar RSA ile kuruma özel."""
    meta = document_encryption_meta(conn, doc_id)
    if not meta:
        raise ValueError("Belge bulunamadı")
    if meta["is_encrypted"]:
        return

    plain_path = find_stored_file(doc_id, meta["file_hash"], meta["filename"])
    if not plain_path or not Path(plain_path).is_file():
        raise ValueError("Şifrelenecek dosya arşivde yok")

    keys = get_institution_rsa_keys(conn, meta["target_institution"] or "")
    if not keys:
        raise ValueError("Kurum RSA anahtarları tanımlı değil")

    public_pem, _private_pem = keys
    plaintext = Path(plain_path).read_bytes()
    ciphertext, aes_key_b64, nonce_b64 = encrypt_bytes_aes_gcm(plaintext)
    aes_key = base64.b64decode(aes_key_b64.encode("ascii"))
    wrapped_key = wrap_aes_key_with_rsa(aes_key, public_pem)

    write_encrypted_document(doc_id, ciphertext)
    delete_plain_document_file(doc_id, meta["filename"], meta["file_hash"])

    cur = conn.cursor()
    if _is_sqlite(conn):
        cur.execute(
            """
            UPDATE documents
            SET is_encrypted = 1, encrypted_aes_key = ?, aes_nonce = ?
            WHERE id = ?
            """,
            (wrapped_key, nonce_b64, doc_id),
        )
    else:
        cur.execute(
            """
            UPDATE documents
            SET is_encrypted = TRUE, encrypted_aes_key = %s, aes_nonce = %s
            WHERE id = %s
            """,
            (wrapped_key, nonce_b64, doc_id),
        )
    conn.commit()
    cur.close()


def decrypt_document_bytes(conn, doc_id: int) -> bytes:
    meta = document_encryption_meta(conn, doc_id)
    if not meta:
        raise ValueError("Belge bulunamadı")
    if not meta["is_encrypted"]:
        plain = find_stored_file(doc_id, meta["file_hash"], meta["filename"])
        if not plain:
            raise ValueError("Dosya bulunamadı")
        return Path(plain).read_bytes()

    keys = get_institution_rsa_keys(conn, meta["target_institution"] or "")
    if not keys:
        raise ValueError("Kurum anahtarları yok")
    _public, private_pem = keys
    if not meta["encrypted_aes_key"] or not meta["aes_nonce"]:
        raise ValueError("Şifreleme meta verisi eksik")

    ciphertext = read_encrypted_document(doc_id)
    aes_key = unwrap_aes_key_with_rsa(meta["encrypted_aes_key"], private_pem)
    return decrypt_bytes_aes_gcm(ciphertext, aes_key, meta["aes_nonce"])
