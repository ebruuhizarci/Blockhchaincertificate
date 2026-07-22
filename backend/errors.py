"""Kullanıcıya gösterilecek Türkçe hata mesajları."""


def friendly_db_error(exc: Exception) -> str:
    msg = str(exc).lower()

    if "unique" in msg or "duplicate" in msg:
        return "Bu kayıt zaten mevcut."

    if "student_id" in msg and ("not-null" in msg or "null value" in msg):
        return (
            "Belge sunucuya kaydedilemedi: kullanıcı profili (student_id) eksik. "
            "Çıkış yapıp tekrar giriş yapın, ardından yeniden yükleyin."
        )

    if "invalid input syntax for type uuid" in msg:
        return (
            "Belge kaydı profil kimliği hatası verdi. Çıkış yapıp tekrar giriş yapın "
            "veya yöneticiye haber verin."
        )

    if "null value" in msg and "not-null" in msg:
        return "Eksik bilgi nedeniyle kayıt yapılamadı. Formu kontrol edip tekrar deneyin."

    if "uploader_name" in msg and "does not exist" in msg:
        return "Sunucu güncelleniyor. Bir dakika sonra tekrar deneyin."

    if "relation" in msg and "users" in msg and "does not exist" in msg:
        return "Henüz üye kaydı açılmamış. Önce üye olun, sonra giriş yapın."

    if "does not exist" in msg and "column" in msg:
        return "Sunucu ayarları güncellenmeli. Yöneticiye haber verin."

    if "connection" in msg or "timeout" in msg or "could not connect" in msg:
        return "Veritabanına bağlanılamadı. İnternet bağlantınızı kontrol edin."

    if "permission denied" in msg:
        return "Veritabanı yetkisi yok. Yöneticiye haber verin."

    return "İşlem tamamlanamadı. Lütfen biraz sonra tekrar deneyin."
