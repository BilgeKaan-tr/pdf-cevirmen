# PDF Çevirmen

Ücretsiz, sınırsız, kurulumsuz PDF çeviri uygulaması. Tamamen tarayıcınızda çalışır —
PDF dosyanız hiçbir sunucuya yüklenmez.

## Özellikler

- 🔒 **Gizli:** Dosya bilgisayarınızdan çıkmaz; yalnızca metin parçaları çeviri servisine gider
- 🖨️ **Taranmış PDF desteği:** Görüntüden metin okuma (OCR) tarayıcıda çalışır; figür/kapak yazıları da isteğe bağlı çevrilir
- 📱 **Kurulabilir:** Tarayıcıdan "Uygulamayı yükle" ile masaüstü/telefon uygulaması gibi çalışır (PWA)
- 🖼️ **Düzen korunur:** Çeviri, görsellerin ve sayfa düzeninin içine yerleştirilir; çıktı PDF'te çeviri seçilebilir gerçek metindir
- ⚡ **Hızlı:** Anahtarsız varsayılan motor; isteğe bağlı ücretsiz Gemini API anahtarıyla daha yüksek kalite
- 🌍 **Çok dilli:** Kaynak dil otomatik algılanır; onlarca hedef dil (varsayılan Türkçe)
- 💸 **Tamamen ücretsiz ve açık kaynak** (MIT)

## Nasıl çalışır?

1. PDF'inizi sürükleyip bırakın
2. Hedef dili seçin (varsayılan Türkçe) ve **Çeviriyi Başlat**'a basın
3. Sayfalar çevrildikçe canlı önizlemede görünür
4. **Çevrilmiş PDF'i İndir** ile sonucu kaydedin

İsterseniz *Ayarlar*'dan [Google AI Studio](https://aistudio.google.com/)'dan ücretsiz
aldığınız Gemini API anahtarını girerek çeviri kalitesini yükseltebilirsiniz. Anahtar
yalnızca tarayıcınızda saklanır.

## Geliştirme

```bash
npm install
npm run dev    # geliştirme sunucusu (http://localhost:5173)
npm test       # birim testleri
npm run build  # üretim derlemesi (dist/)
```

`public/ornek.pdf` test için hazır örnek bir dosyadır (`node scripts/make-sample.mjs` ile
yeniden üretilebilir).

## Sınırlar (v1)

- Taranmış (görüntü) PDF'ler dahili OCR (Tesseract) ile çevrilir; el yazısı ve çok düşük kaliteli taramalarda doğruluk sınırlıdır
- Hedef dil listesi Latin/Kiril/Yunan alfabeli dillerle sınırlıdır (kaynak dil için sınır yok)
- Çıktı PDF'te sayfa arka planı görüntüye dönüştürülür (dosya boyutu artabilir)

## Lisans

[MIT](LICENSE) — dilediğiniz gibi kullanın, kopyalayın, geliştirin.
