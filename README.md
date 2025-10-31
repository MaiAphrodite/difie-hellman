# Simulasi Diffie–Hellman (Minimal)

Web sederhana untuk memperlihatkan langkah-langkah pertukaran kunci Diffie–Hellman secara bertahap (step-by-step). UI minimal, tanpa library.

## Fitur
- Dua panel: kiri untuk parameter (p, g, a, b), kanan untuk langkah-langkah.
- Validasi dasar: p prima (Miller–Rabin deterministik 64-bit), 2 ≤ a,b ≤ p−2, 2 ≤ g ≤ p−1.
- Perhitungan menggunakan BigInt: A = g^a mod p, B = g^b mod p, S = B^a mod p = A^b mod p.
- Stepper interaktif dengan highlight langkah aktif dan ringkasan/perhitungan per langkah.
- Mode Rinci/Ringkas untuk penjelasan (toggle "Mode Rinci").
- Tombol salin nilai di A/B/S untuk memudahkan copy ke clipboard.
- Tombol navigasi "Langkah sebelumnya" dan "Langkah berikutnya", plus Auto Play dan Reset.

### Bonus: Latar belakang Conway's Game of Life
- Kanvas animasi halus di latar (tidak mengganggu interaksi) dengan pola "engineered" seperti Gosper glider gun, Pulsar, Glider, LWSS/MWSS/HWSS, R-pentomino, Acorn.
- Dapat dikonfigurasi via parameter URL:
	- `life` = `mix` (default) | `guns` | `gliders` | `spaceships` | `gosper` | `pulsar` | `glider` | `lwss` | `mwss` | `hwss` | `rpentomino` | `acorn` | `random`
	- Mode pertempuran: `life=battle` dengan dua kubu (ally vs enemy), gelombang (waves) bertambah seiring waktu.
	- `speed` = FPS (6..60, default 24)
	- `cell` = ukuran sel px (4..40; default otomatis 6..14 tergantung layar)
	- `color` = warna CSS (mis. `%23ff006e` untuk hex merah muda; URL-encode `#`)
	- `alpha` = opasitas 0..1 (default 0.12)
		- `density`/`dens` = 0.5..3 (kepadatan seeding)
		- Battle opsional: `ally` (warna kubu 1), `enemy` (warna kubu 2), `wave` (ms interval), `growth` (tambah unit per gelombang), `base` (unit awal per gelombang)

Contoh:

```
index.html?life=guns&speed=20&cell=10&color=%236366f1&alpha=0.12

// Mode pertempuran, gelombang bertambah cepat
index.html?life=battle&ally=%2310b981&enemy=%23ef4444&wave=3000&growth=2&base=3&density=1.4
```

## Cara Menjalankan (Windows)
- Cara paling mudah: buka file `index.html` dengan browser (double-click).
- Alternatif (opsional, jika punya Python): jalankan server statis lalu akses `http://localhost:8000`.

```powershell
# Opsional apabila ingin via server lokal (butuh Python 3)
python -m http.server 8000
```

## Cara Pakai
1. Isi/ubah parameter di panel kiri: p (prima), g, a (Alice), b (Bob).
2. Klik "Validasi" untuk memeriksa parameter.
3. Gunakan "Langkah berikutnya"/"Langkah sebelumnya" untuk menavigasi, atau aktifkan "Auto Play".
4. Nilai A, B, dan kunci S hanya ditampilkan saat mencapai langkah terkait (disembunyikan sebelumnya agar narasi konsisten). Anda bisa menyalin nilai dengan tombol "Salin".
5. "Reset" mengembalikan tampilan ke awal (parameter tidak diubah kecuali Anda ubah sendiri).

## Catatan
- Ini untuk edukasi. Jangan gunakan parameter kecil di produksi. Gunakan bilangan prima besar dan generator yang sesuai.
- Pengecekan keprimaan di sini akurat untuk bilangan ≤ 2^64. Untuk bilangan jauh lebih besar, hasilnya bersifat probabilistik dengan basis terbatas.
- Pengacakan a,b memakai `crypto.getRandomValues` dan bekerja untuk rentang besar (BigInt) lewat penolakan sampel (rejection sampling).

## Struktur
- `index.html` — markup halaman dan gaya minimal.
- `app.js` — logika Diffie–Hellman dan kendali UI.
 - `life-bg.js` — latar belakang Game of Life (kanvas tetap, animasi ringan).

### Kepadatan dan pola
- Tambahan pola: blinker, toad, beacon, pentadecathlon (oscillators) dan block, beehive, loaf, boat, tub (still lifes), serta LWSS/MWSS/HWSS.
- Parameter `density` (atau `dens`) mengatur kepadatan seeding (0.5..3, default ~1.5).
- Preset `dense` dan `ultra` juga tersedia: `life=dense` atau `life=ultra`.

Contoh padat:

```
index.html?life=mix&density=2&speed=24&alpha=0.1
```
