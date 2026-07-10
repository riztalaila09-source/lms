# Guideline Testing.

## General Brief.
1. prioritas urutan pembuatan testing selalu mengikuti development pada umumnya. Dari yang paling mudah ke yang paling kompleks. Urutan nya sebagai berikut:
    - Unit Testing
    - Integration Testing
    - End to End Testing jika diperlukan.

2. Untuk End to End Testing cukup di lingkungan typescript dengan playwright. tidak perlu sampai menulis memakai golang.


# Testing Yang Perlu Di Cover.
## Testing Fitur Materi.
1. Pastikan bisa create materi.
2. Pastikan bisa edit materi.
    - di edit materi, pastikan data materi sebelumnya ter load dengan benar.