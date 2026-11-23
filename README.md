# BÜMT web sitesi

Başkent Üniversitesi Müzik Topluluğu sitesi: üyelik, prova odası, enstrüman kursları, dinletiler, etkinlikler, formlar ve yönetim paneli.

- **Site:** `public/index.html` + `public/assets/site.js`
- **Yönetim paneli:** `public/yonetim/` + `public/assets/admin.js`
- **Sunucu fonksiyonları (Vercel):** `api/config.js`, `api/admin.js`
- **Veritabanı:** `supabase/schema.sql` (Supabase SQL Editor'de bir kez çalıştırılır)

Derleme adımı yok; Vercel `public/` klasörünü olduğu gibi yayınlar.

## Vercel ortam değişkenleri

| Ad | Nereden |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys → Publishable key (ya da eski `anon` anahtarı) |
| `SUPABASE_SECRET_KEY` | Supabase → API Keys → Secret key (ya da eski `service_role` anahtarı). **Kimseyle paylaşma.** |

## Hesaplar

- Üyeler öğrenci numarası + şifreyle girer (arka planda `<numara>@uye.bumt.com.tr`).
- Yönetim hesapları kullanıcı adıyla girer (arka planda `<kullanıcı>@yonetim.bumt.com.tr`).
- `admin@yonetim.bumt.com.tr` hesabı otomatik olarak süper yönetici olur.

## Yetki anahtarları

`uyeler`, `roller`, `prova`, `kurslar`, `dinletiler`, `etkinlikler`, `formlar` — roller panelden düzenlenir. Kurallar (rezervasyon pencereleri, haftalık hak vb.) veritabanında uygulanır.
