# Frontend Development Guideline

## General Guideline
1. setiap aksi destruktif seperti delete, accept dan lainnya tampilkan confirmation dialog dulu. untuk referensi komponen lihat [ini](https://chakra-ui.com/docs/components/dialog).
2. untuk membuat setiap komponen tampilan jangan menggunakan native. Selalu prioritaskan menggunakan `chakra-ui`.
3. untuk setiap alert yang ada dalam tampilan seperti warning, info, sukses, dan error yang terjadi, jangan menggunakan fungsi `alert` native dari javascript. Tetapi gunakan `toast` dari `chakra-ui`. untuk referensi komponen lihat [ini](https://chakra-ui.com/docs/components/toast).



