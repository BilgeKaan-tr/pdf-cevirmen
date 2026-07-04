# PDF Çevirmen v2 — OCR, PWA ve Arayüz Yenileme Tasarımı

**Tarih:** 2026-07-04
**Durum:** Kullanıcı tarafından onaylandı (sohbet içinde), spec incelemesi bekleniyor
**Temel:** v1 spec'i (`2026-07-03-pdf-cevirmen-design.md`) geçerliliğini korur; bu doküman yalnızca eklemeleri tanımlar.

## 1. Amaç

1. **Görsel metin çevirisi:** Taranmış (görüntü) PDF'ler, kitap kapakları ve sayfa içi
   resim/figür yazıları da çevrilebilsin. v1'in "bu PDF taranmış, çeviremiyorum" sınırı kalksın.
2. **Kurulabilir uygulama:** Site, PWA olarak masaüstüne/telefona yüklenebilsin.
3. **Ürün görünümü:** Sade ve profesyonel bir arayüz; otomatik açık/koyu tema; basit marka/logo.

Değişmeyen ilkeler: sıfır maliyet, sunucusuz, dosya bilgisayardan çıkmaz (OCR dahil —
Tesseract tarayıcıda çalışır), MIT lisans.

## 2. OCR mimarisi (akıllı mod)

**Motor:** Tesseract.js (Apache-2.0). Yalnızca gerektiğinde dinamik import edilir;
WASM + dil verisi (~12 MB) CDN'den ilk kullanımda iner, service worker önbelleğe alır.
Tek Tesseract worker'ı oluşturulur ve sayfalar arasında yeniden kullanılır.

**Yeni modül `src/ocr/ocr.ts`:**
- `getOcrLang(sourceCode: string): string` — arayüz dil kodunu Tesseract koduna eşler
  (en→eng, de→deu, fr→fra, es→spa, it→ita, pt→por, nl→nld, ru→rus, uk→ukr, pl→pol,
  ar→ara, fa→fas, zh-CN→chi_sim, ja→jpn, ko→kor, hi→hin, el→ell, sv→swe, tr→tur;
  auto→eng). Saf fonksiyon, birim testli.
- `ocrCanvas(canvas, lang): Promise<OcrParagraph[]>` — Tesseract'tan paragraf düzeyinde
  sonuç alır: `{ text, bbox(px), confidence }`.
- `ocrParagraphsToItems(paras, scale): RawItem[]` — piksel bbox'ları ölçeğe bölerek PDF
  puntosuna çevirir (y zaten üstten; mevcut koordinat sistemine birebir uyar), satır
  yüksekliğinden yazı boyutu türetir. Saf fonksiyon, birim testli.
- **Güven süzgeci:** confidence < 60 olan ya da `isTranslatable`'ı geçemeyen paragraflar
  elenir (yanlış okumadan saçma çeviri üretilmez; blok orijinal görüntüsüyle kalır).

**Pipeline entegrasyonu (`src/pipeline.ts` + `src/main.ts`):**
- `PageStage`'e isteğe bağlı `ocr?(pageNum): Promise<RawItem[]>` eklenir.
- **Taranmış sayfa** (`pageText.scanned`): v1'de sayfa olduğu gibi kopyalanıyordu; v2'de
  `stage.ocr` varsa OCR öğeleri alınır, mevcut gruplama → çeviri → maskeleme →
  yerleştirme hattı AYNEN çalışır. OCR hiç öğe bulamazsa v1 davranışına düşülür
  (sayfa kopyalanır, `scannedPages` raporlanır).
- **Figür modu** (yalnızca "Görsellerdeki metinleri de çevir" kutusu işaretliyse):
  metin katmanlı sayfalarda da OCR çalışır; OCR bloklarından, metin katmanı bloklarıyla
  **dikey-yatay örtüşme oranı > %30** olanlar elenir (aynı metni iki kez çevirmemek
  için), kalanlar (figür etiketleri, resim üstü yazılar) blok listesine eklenir.
  Örtüşme süzgeci saf fonksiyon (`filterNonOverlapping(ocrBlocks, textBlocks)`), birim testli.
- OCR sayfa görüntüsü mevcut `renderPageToCanvas` çıktısını kullanır (ek render yok).
  Durum satırı OCR sırasında "Sayfa X görselden okunuyor…" gösterir.

**Hata yönetimi:** OCR init/recognize hatası sayfayı asla düşürmez → sayfa v1 yoluyla
kopyalanır, uyarı listesinde "N sayfada görsel okuma başarısız" raporlanır.
`errScannedAll` mesajı güncellenir: taranmış PDF artık desteklenir; mesaj yalnızca
OCR'ın da metin bulamadığı (gerçekten boş/karalama) durumda görünür.

## 3. PWA

- **Araç:** `vite-plugin-pwa` (MIT), `generateSW` modu.
- **Manifest:** ad "PDF Çevirmen", kısa ad "PDFÇevir", tema/arka plan renkleri arayüz
  paletinden, `display: standalone`, 192/512 px ikonlar + maskable ikon.
- **İkon:** basit marka: yuvarlatılmış kare içinde belge + çeviri oku simgesi (SVG
  kaynak; PNG'ler `sharp` devDependency'li `scripts/make-icons.mjs` ile üretilip commit'lenir).
- **Önbellek stratejisi:** uygulama kabuğu precache; `fonts/*.ttf` ve Tesseract CDN
  varlıkları CacheFirst; çeviri istekleri (translate.googleapis.com, lingva,
  generativelanguage) ASLA önbelleğe alınmaz (NetworkOnly).
- Çevrimdışı açılışta arayüz çalışır; çeviri denenince mevcut ağ-hatası akışı devreye girer.

## 4. Arayüz yenileme (sade & profesyonel)

- **Palet:** tek vurgu rengi (mavi #2563eb korunur); `prefers-color-scheme` ile otomatik
  açık/koyu tema (CSS değişkenleri; koyu temada kart/arka plan/metin renkleri tanımlı).
- **Yerleşim:** üstte logo + ad + tek cümle slogan; ortada büyük sürükle-bırak kartı;
  altında tek satır seçenek çubuğu (diller, görsel-çeviri kutusu, ayarlar); işlem
  ekranında ilerleme çubuğu + durum + canlı önizleme; altbilgi: gizlilik notu, GitHub
  bağlantısı, "MIT lisansı" ve sürüm.
- **Yeni arayüz metinleri** `strings.ts`'e eklenir: figür kutusu etiketi, OCR durum
  mesajları, OCR uyarıları, çevrimdışı notu, "Uygulamayı yükle" ipucu.
- Framework eklenmez; `index.html` + `styles.css` yeniden yazılır, `main.ts`'te yalnızca
  yeni kontrollerin bağlanması değişir. Erişilebilirlik: kontrast AA, odak halkaları,
  `role="status"` korunur.

## 5. Test stratejisi

- **Birim (TDD):** `getOcrLang`, `ocrParagraphsToItems` (ölçek/koordinat dönüşümü),
  güven süzgeci, `filterNonOverlapping` örtüşme mantığı, pipeline'ın OCR dallanmaları
  (sahte `ocr` aşamasıyla: taranmış sayfa çevrilir; OCR boş dönerse kopyalanır; figür
  modunda örtüşenler elenir).
- **Tesseract entegrasyonu** birim teste sokulmaz (ağır WASM); tarayıcıda, taranmış
  örnek PDF ile elle uçtan uca doğrulanır. Taranmış örnek, mevcut `ornek.pdf`'in
  sayfalarını görüntüye çevirip görüntü-PDF'i olarak paketleyen tarayıcı içi bir
  adımla üretilir ve `public/ornek-taranmis.pdf` olarak kaydedilir.
- PWA: `npm run build` sonrası manifest/service worker üretimi doğrulanır; kurulum ve
  çevrimdışı açılış tarayıcıda elle test edilir.

## 6. Kapsam dışı (v2'de de yok)

- Gemini ile görüntü tabanlı OCR/çeviri (gizlilik sözünü bozar; ileride isteğe bağlı olabilir).
- El yazısı OCR güvencesi (Tesseract sınırlıdır; düşük güven süzgeci korur).
- Arapça/CJK **hedef** diller (v1 sınırı sürer; OCR *kaynak* olarak bu dilleri destekler).
- Windows .exe paketi.

## 7. Uygulama sırası

1. OCR çekirdeği (modül + taranmış sayfa akışı + testler)
2. Figür modu (kutu + örtüşme süzgeci + testler)
3. PWA (ikonlar, manifest, service worker, önbellek kuralları)
4. Arayüz yenileme (index.html + styles.css + yeni metinler)
5. Uçtan uca doğrulama (taranmış örnekle) + README güncellemesi
