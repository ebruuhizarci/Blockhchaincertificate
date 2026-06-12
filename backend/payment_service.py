"""Ödeme oturumu + iyzico + blockchain mühürleme."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from database import (
    create_payment_session,
    get_db_connection,
    get_document_by_file_hash,
    get_payment_session,
    insert_document,
    set_document_blockchain_tx,
    update_payment_session,
)
from file_storage import has_stored_file, save_document_file
from iyzico_client import initialize_checkout, mock_checkout_url, retrieve_checkout
from payment_config import (
    FRONTEND_URL,
    IYZICO_MOCK,
    PAYMENT_AMOUNT_TRY,
    iyzico_configured,
    relayer_configured,
)
from relayer import is_certificate_on_chain, seal_certificate_on_chain

PENDING_DIR = Path(__file__).resolve().parent / "uploads" / "pending"


def pending_pdf_path(session_id: str) -> Path:
    PENDING_DIR.mkdir(parents=True, exist_ok=True)
    return PENDING_DIR / f"{session_id}.pdf"


def start_card_payment(
    *,
    file_content: bytes,
    filename: str,
    file_hash: str,
    uploader_name: str,
    target_institution: str,
    user_email: str,
    buyer_ip: str,
) -> dict:
    if not relayer_configured():
        return {
            "error": "Sunucu cüzdanı yapılandırılmamış. RELAYER_PRIVATE_KEY .env dosyasına ekleyin.",
        }

    if is_certificate_on_chain(file_hash):
        return {
            "error": "Bu belge zaten blockchain'de kayıtlı. Cüzdan veya ücretsiz arşiv akışını kullanın.",
        }

    conn = get_db_connection()
    if not conn:
        return {"error": "Veritabanı bağlantısı kurulamadı"}

    try:
        existing = get_document_by_file_hash(conn, file_hash)
        if existing and existing.get("blockchain_tx_hash"):
            return {"error": "Bu belge zaten kayıtlı ve mühürlenmiş."}

        session_id = str(uuid.uuid4())
        amount = float(PAYMENT_AMOUNT_TRY)
        create_payment_session(
            conn,
            session_id,
            user_email=user_email,
            uploader_name=uploader_name,
            target_institution=target_institution,
            filename=filename,
            file_hash=file_hash,
            amount_try=amount,
        )
        pending_pdf_path(session_id).write_bytes(file_content)

        if IYZICO_MOCK:
            return {
                "session_id": session_id,
                "payment_page_url": mock_checkout_url(session_id),
                "amount_try": amount,
                "mock": True,
            }

        if not iyzico_configured():
            return {
                "error": "iyzico yapılandırılmamış. IYZICO_API_KEY ve IYZICO_SECRET_KEY ekleyin "
                "veya geliştirme için IYZICO_MOCK=true kullanın.",
            }

        result = initialize_checkout(
            session_id=session_id,
            buyer_name=uploader_name,
            buyer_email=user_email,
            buyer_ip=buyer_ip,
            filename=filename,
        )

        if result.get("status") != "success":
            update_payment_session(
                conn,
                session_id,
                status="failed",
                error_message=result.get("errorMessage") or "iyzico başlatılamadı",
            )
            return {
                "error": result.get("errorMessage") or "Ödeme sayfası oluşturulamadı",
            }

        token = result.get("token")
        payment_url = result.get("paymentPageUrl")
        update_payment_session(
            conn,
            session_id,
            iyzico_token=token,
        )
        return {
            "session_id": session_id,
            "payment_page_url": payment_url,
            "amount_try": amount,
        }
    finally:
        conn.close()


def complete_payment(session_id: str, token: str, *, mock: bool = False) -> dict:
    conn = get_db_connection()
    if not conn:
        return {"ok": False, "error": "Veritabanı bağlantısı kurulamadı"}

    try:
        session = get_payment_session(conn, session_id)
        if not session:
            return {"ok": False, "error": "Ödeme oturumu bulunamadı"}

        if session["status"] == "completed":
            return {
                "ok": True,
                "already": True,
                "doc_id": session.get("doc_id"),
                "blockchain_tx": session.get("blockchain_tx_hash"),
            }

        payment_ok = False
        payment_status = "MOCK_SUCCESS" if mock else None

        if mock and IYZICO_MOCK:
            payment_ok = True
        else:
            if not token:
                return {"ok": False, "error": "Ödeme token eksik"}
            result = retrieve_checkout(token, session_id)
            payment_status = result.get("paymentStatus")
            if result.get("status") == "success" and payment_status == "SUCCESS":
                payment_ok = True
            else:
                update_payment_session(
                    conn,
                    session_id,
                    status="failed",
                    payment_status=payment_status,
                    error_message=result.get("errorMessage") or "Ödeme başarısız",
                )
                return {
                    "ok": False,
                    "error": result.get("errorMessage") or "Ödeme tamamlanmadı",
                }

        if not payment_ok:
            return {"ok": False, "error": "Ödeme doğrulanamadı"}

        update_payment_session(
            conn,
            session_id,
            status="paid",
            payment_status=payment_status or "SUCCESS",
            iyzico_token=token,
            paid_at=datetime.now(timezone.utc).isoformat(),
        )

        file_hash = session["file_hash"]
        pdf_path = pending_pdf_path(session_id)
        if not pdf_path.is_file():
            update_payment_session(
                conn,
                session_id,
                status="failed",
                error_message="Bekleyen PDF bulunamadı",
            )
            return {"ok": False, "error": "Yüklenen dosya bulunamadı"}

        file_content = pdf_path.read_bytes()

        tx_hash = session.get("blockchain_tx_hash")
        if not tx_hash:
            try:
                if is_certificate_on_chain(file_hash):
                    tx_hash = "already_on_chain"
                else:
                    tx_hash = seal_certificate_on_chain(file_hash)
            except ValueError as e:
                update_payment_session(
                    conn,
                    session_id,
                    status="failed",
                    error_message=str(e),
                )
                return {"ok": False, "error": str(e)}
            except Exception as e:
                update_payment_session(
                    conn,
                    session_id,
                    status="failed",
                    error_message=str(e),
                )
                return {
                    "ok": False,
                    "error": "Blockchain kaydı başarısız. Ödemeniz alındı; destek ile iletişime geçin.",
                }

            update_payment_session(
                conn,
                session_id,
                blockchain_tx_hash=tx_hash if tx_hash != "already_on_chain" else None,
            )

        existing = get_document_by_file_hash(conn, file_hash)
        if existing:
            doc_id = existing["id"]
            if tx_hash and tx_hash != "already_on_chain":
                set_document_blockchain_tx(conn, doc_id, tx_hash)
        else:
            doc_id = insert_document(
                conn,
                session["filename"],
                file_hash,
                session["uploader_name"],
                session["target_institution"],
                session["user_email"],
            )
            if tx_hash and tx_hash != "already_on_chain":
                set_document_blockchain_tx(conn, doc_id, tx_hash)

        if not has_stored_file(doc_id, file_hash, session["filename"]):
            save_document_file(doc_id, session["filename"], file_content)

        try:
            pdf_path.unlink(missing_ok=True)
        except Exception:
            pass

        update_payment_session(
            conn,
            session_id,
            status="completed",
            doc_id=doc_id,
            blockchain_tx_hash=tx_hash if tx_hash != "already_on_chain" else existing.get("blockchain_tx_hash") if existing else None,
        )

        return {
            "ok": True,
            "doc_id": doc_id,
            "blockchain_tx": tx_hash,
            "file_hash": file_hash,
        }
    finally:
        conn.close()


def get_session_status(session_id: str) -> dict | None:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        return get_payment_session(conn, session_id)
    finally:
        conn.close()
