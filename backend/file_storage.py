"""Yüklenen belgelerin yerel dosya arşivi."""
from pathlib import Path

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
ENCRYPTED_DIR = UPLOAD_DIR / "encrypted"


def upload_dir() -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR


def _safe_ext(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext in (".pdf", ".png", ".jpg", ".jpeg", ".webp"):
        return ext
    return ".pdf"


def _path_for_doc(doc_id: int, filename: str) -> Path:
    return upload_dir() / f"doc_{doc_id}{_safe_ext(filename)}"


def _path_for_hash(file_hash: str, filename: str) -> Path:
    return upload_dir() / f"{file_hash}{_safe_ext(filename)}"


def save_document_file(doc_id: int, filename: str, content: bytes) -> Path:
    """Belge dosyasını doc_{id}.pdf olarak kaydeder."""
    if not content:
        raise ValueError("Dosya içeriği boş")
    path = _path_for_doc(doc_id, filename)
    path.write_bytes(content)
    if path.stat().st_size == 0:
        raise IOError(f"Dosya yazılamadı: {path}")
    legacy = _path_for_hash(
        __import__("hashlib").sha256(content).hexdigest(), filename
    )
    if legacy != path:
        try:
            legacy.write_bytes(content)
        except Exception:
            pass
    return path


def find_stored_file(
    doc_id: int,
    file_hash: str | None = None,
    filename: str | None = None,
) -> Path | None:
    name = filename or "belge.pdf"
    primary = _path_for_doc(doc_id, name)
    if primary.is_file() and primary.stat().st_size > 0:
        return primary

    if file_hash:
        by_hash = _path_for_hash(file_hash, name)
        if by_hash.is_file() and by_hash.stat().st_size > 0:
            return by_hash
        for p in upload_dir().glob(f"{file_hash}.*"):
            if p.is_file() and p.stat().st_size > 0:
                return p

    return None


def encrypted_path_for_doc(doc_id: int) -> Path:
    ENCRYPTED_DIR.mkdir(parents=True, exist_ok=True)
    return ENCRYPTED_DIR / f"doc_{doc_id}.aes"


def write_encrypted_document(doc_id: int, ciphertext: bytes) -> Path:
    path = encrypted_path_for_doc(doc_id)
    path.write_bytes(ciphertext)
    return path


def read_encrypted_document(doc_id: int) -> bytes:
    path = encrypted_path_for_doc(doc_id)
    if not path.is_file():
        raise FileNotFoundError(f"Şifreli dosya yok: {path}")
    return path.read_bytes()


def delete_plain_document_file(
    doc_id: int,
    filename: str | None = None,
    file_hash: str | None = None,
) -> None:
    path = find_stored_file(doc_id, file_hash, filename)
    if path and path.is_file():
        try:
            path.unlink()
        except Exception:
            pass


def has_encrypted_file(doc_id: int) -> bool:
    p = encrypted_path_for_doc(doc_id)
    return p.is_file() and p.stat().st_size > 0


def has_stored_file(
    doc_id: int,
    file_hash: str | None = None,
    filename: str | None = None,
) -> bool:
    return find_stored_file(doc_id, file_hash, filename) is not None or has_encrypted_file(
        doc_id
    )


# Geriye uyumluluk
def save_uploaded_file(file_hash: str, filename: str, content: bytes) -> Path:
    upload_dir()
    path = _path_for_hash(file_hash, filename)
    path.write_bytes(content)
    return path
