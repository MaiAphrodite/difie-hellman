# Simulasi Diffie–Hellman (Minimal)

Web sederhana untuk memperlihatkan langkah-langkah pertukaran kunci Diffie–Hellman secara bertahap (step-by-step). UI minimal, tanpa library.

## Fitur
- Dua panel: kiri untuk parameter (p, g, a, b), kanan untuk langkah-langkah.
- Validasi dasar: p prima (Miller–Rabin deterministik 64-bit), 2 ≤ a,b ≤ p−2, 2 ≤ g ≤ p−1.
- Perhitungan menggunakan BigInt: A = g^a mod p, B = g^b mod p, S = B^a mod p = A^b mod p.
- Tombol: Validasi, Acak a/b, Langkah berikutnya, Auto Play, Reset.

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
3. Klik "Langkah berikutnya" berulang untuk melihat proses, atau gunakan "Auto Play".
4. Nilai A, B, dan kunci bersama S akan muncul saat langkah terkait tercapai.
5. "Reset" mengembalikan tampilan ke awal (parameter tidak diubah kecuali Anda ubah sendiri).

## Catatan
- Ini untuk edukasi. Jangan gunakan parameter kecil di produksi. Gunakan bilangan prima besar dan generator yang sesuai.
- Pengecekan keprimaan di sini akurat untuk bilangan ≤ 2^64. Untuk bilangan jauh lebih besar, hasilnya bersifat probabilistik dengan basis terbatas.
- Pengacakan a,b memakai `crypto.getRandomValues` dan bekerja untuk rentang besar (BigInt) lewat penolakan sampel (rejection sampling).

## Struktur
- `index.html` — markup halaman dan gaya minimal.
- `app.js` — logika Diffie–Hellman dan kendali UI.
