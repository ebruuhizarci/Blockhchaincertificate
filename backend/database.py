import psycopg2

def get_db_connection():
    try:
        conn = psycopg2.connect(
            host="aws-1-ap-south-1.pooler.supabase.com",
            database="postgres",
            user="postgres.fjlrvesxyfcftrovtnig",
            password="aykutkarakaya",
            port="6543",
            sslmode='require',
            connect_timeout=10 # Bağlanmak için 10 saniye bekle (zorla)
        )
        return conn
    except Exception as e:
        print(f"Veritabanı bağlantı hatası: {e}")
        return None