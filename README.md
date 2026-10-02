# Stailo Event

Apps sewa tapak event untuk **admin** dan **vendor**. Ia ialah web apps (PWA): vendor buka link, kemudian tekan *Add to Home screen* di Android, dan apps itu keluar sebagai ikon macam apps biasa.

- **Admin:** cipta **ID vendor** (contoh V001) dan kata laluan, cipta event, muat naik dan buang gambar pelan tapak, jana dan edit tapak (A1, B1 … macam kerusi bas), semak resit, kunci tapak, buat invois dan hantar melalui WhatsApp, emel atau PDF.
- **Vendor:** log masuk dengan ID vendor yang diberi admin, pilih nombor tapak, bayar (DuitNow QR atau pindahan bank), muat naik resit, dan lihat tempahan serta invois sendiri.

Vendor **tak boleh daftar sendiri**. Hanya admin boleh cipta akaun vendor.

Kos: RM0. Pakej percuma Supabase dan GitHub Pages sudah cukup.

---

## Aliran tempahan

1. Vendor klik tapak kosong, kemudian tekan **Teruskan bayar**. Tapak itu **ditahan** untuk dia (15 minit secara default, boleh ditukar dalam Tetapan).
2. Vendor bayar melalui DuitNow QR atau bank, kemudian muat naik resit. Status tapak bertukar kepada **Dibayar · perlu kunci** (warna oren di skrin admin).
3. Admin buka tapak itu, semak resit, dan tekan **Sahkan bayaran & kunci tapak**. Tapak **dikunci** dan invois "Dibayar" dicipta secara automatik.
4. Admin tekan **Hantar melalui WhatsApp** untuk hantar invois kepada vendor.

Kalau vendor tak bayar dalam masa yang ditetapkan, tapak itu dilepaskan semula secara automatik. Seorang vendor hanya boleh ada satu tempahan aktif bagi setiap event.

---

## Langkah 1: Sediakan Supabase

1. Daftar di <https://supabase.com>, kemudian tekan **New project**. Pilih region **Southeast Asia (Singapore)**.
2. Buka **SQL Editor**, tekan **New query**, salin semua isi fail `supabase/schema.sql`, kemudian tekan **Run**.
3. Buka **Project Settings → API** dan salin dua nilai:
   - **Project URL**
   - **anon public key**
4. Buka fail `js/config.js` dan tampal kedua-dua nilai itu:

   ```js
   export const SUPABASE_URL = 'https://abcdxyz.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

   Kunci **anon** selamat diletak di sini. Jangan sesekali guna kunci **service_role**.
5. Buka **Authentication → Sign In / Providers** dan **matikan "Allow new users to sign up"**. Langkah ini **wajib**, supaya orang luar tak boleh cipta akaun sendiri. Akaun vendor hanya dicipta oleh admin dari dalam apps.

## Langkah 2: Letak di GitHub Pages

1. Cipta repo baru di GitHub, contohnya `stailo-event`.
2. Push semua fail dalam folder ini:

   ```bash
   git init
   git add .
   git commit -m "Stailo Event"
   git branch -M main
   git remote add origin https://github.com/NAMA-ANDA/stailo-event.git
   git push -u origin main
   ```

3. Di GitHub, buka **Settings → Pages**. Pada **Source**, pilih *Deploy from a branch*, kemudian **main** dan folder **/ (root)**, dan tekan **Save**.
4. Selepas 1–2 minit, apps boleh dibuka di `https://NAMA-ANDA.github.io/stailo-event/`.
5. Kembali ke Supabase dan buka **Authentication → URL Configuration**. Isi **Site URL** dengan alamat GitHub Pages di atas. Tanpa langkah ini, pautan dalam emel (contohnya lupa kata laluan) tak akan berfungsi.

## Langkah 3: Cipta akaun admin

1. Di Supabase, buka **SQL Editor** dan jalankan arahan ini (tukar kata laluan kepada kata laluan anda, sekurang-kurangnya 8 aksara):

   ```sql
   select public.setup_admin('admin', 'KATA-LALUAN-ADMIN');
   ```

2. Buka apps dan log masuk dengan **ID:** `admin` serta kata laluan tadi.

**Admin lupa kata laluan?** Jalankan semula arahan yang sama dengan kata laluan baru, dan kata laluan lama akan diganti.

Jangan simpan kata laluan admin dalam mana-mana fail projek, kerana repo GitHub boleh dilihat orang lain.

## Langkah 4: Tetapan pertama (dalam apps)

1. Buka **Tetapan**. Isi nama syarikat, alamat, maklumat bank, dan muat naik **DuitNow QR**.
2. Buka **Tapak**, tekan **+** untuk cipta event, dan muat naik **gambar pelan tapak**.
3. Tekan **Jana tapak**, contohnya 4 lajur × 6 baris dengan laluan tengah selepas lajur ke-2. Tapak A1–D6 akan dicipta. Tapak boleh diedit atau dibuang satu-satu kemudian.
4. Buka **Vendor** dan tekan **Vendor baru**. ID (V001, V002 …) dan kata laluan sementara dijana secara automatik. Isi nama dan nombor telefon, kemudian tekan **Cipta akaun vendor**.
5. Tekan **Hantar melalui WhatsApp**. Vendor akan terima ID, kata laluan dan link apps.

## Urus vendor

- **Vendor lupa kata laluan:** buka **Vendor**, tekan nama vendor, tekan **Set semula kata laluan**, dan hantar kata laluan baru melalui WhatsApp.
- **Halang vendor:** tekan **Nyahaktif**. Vendor itu tak boleh log masuk atau tempah tapak, tapi tempahan dan invois lamanya kekal. Tekan **Aktifkan** untuk benarkan semula.
- Vendor boleh tukar kata laluan sendiri dalam menu **Akaun**.
- Di belakang tabir, ID (contoh `V001` atau `admin`) disimpan sebagai emel dalaman `v001@vendor.stailoevent.app` dalam Supabase. Tiada emel dihantar ke alamat itu. Abaikan saja kalau anda nampak alamat ini dalam senarai Users.

---

## Video intro & muzik (halaman depan)

Halaman depan memainkan `assets/intro.mp4` berulang-ulang sebagai latar, dan bunyi video tu dijadikan muzik latar. Phone tak benarkan video main dengan bunyi secara automatik, jadi video mula tanpa bunyi dan bunyi keluar selepas pengguna sentuh skrin sekali. Butang **Muzik ON/OFF** di atas kanan boleh mematikan atau menghidupkan bunyi.

Untuk tukar video, ganti `assets/intro.mp4` (format MP4, potret 9:16, sebaiknya bawah 5MB) dan `assets/intro-poster.jpg` (gambar yang dipaparkan sementara video dimuatkan).

## Sudah jalankan schema.sql versi lama?

Jalankan semula **keseluruhan** `supabase/schema.sql` dalam SQL Editor. Fail ini selamat dijalankan berulang kali, dan data sedia ada tak akan terpadam.

## Kemas kini apps

Selepas ubah kod, tukar `VERSION` dalam `sw.js` (contohnya `stailo-v2`), kemudian push ke GitHub. Phone vendor akan dapat versi baru bila apps dibuka semula.

## Struktur fail

```
index.html              Halaman utama apps
manifest.webmanifest    Maklumat PWA (nama, ikon)
sw.js                   Service worker (cache)
css/app.css             Rekaan
js/config.js            ← isi URL & kunci Supabase di sini
js/app.js               Navigasi
js/lib.js               Fungsi bersama, peta tapak
js/views-auth.js        Selamat datang, log masuk (ID vendor), akaun, muzik
js/views-vendor.js      Pilih tapak, bayaran, tempahan
js/views-admin.js       Utama, tapak, vendor (cipta ID), invois, tetapan
js/views-invoice.js     Paparan invois, WhatsApp, PDF
supabase/schema.sql     Pangkalan data, keselamatan, fungsi
icons/                  Ikon apps
assets/intro.mp4        Video intro + muzik halaman depan
assets/intro-poster.jpg Gambar sementara video dimuatkan
```

## Keselamatan

- Vendor **tak boleh** ubah tapak secara terus. Semua tindakan melalui fungsi pangkalan data yang menyemak status tapak, jadi dua vendor tak boleh ambil tapak yang sama.
- Hanya admin boleh muat naik atau buang gambar pelan tapak, kunci tapak, dan urus invois.
- Resit vendor disimpan secara peribadi. Hanya vendor itu sendiri dan admin boleh lihat.

## Payment gateway (masa depan)

Kalau mahu bayaran FPX automatik (contohnya ToyyibPay atau Billplz), langkah *muat naik resit* boleh diganti dengan gateway, dan status "dibayar" akan dikemas kini secara automatik. Ini memerlukan Supabase Edge Function untuk terima callback daripada gateway.
