# PDF Çevirmen — Tasarım Dokümanı

**Tarih:** 2026-07-03
**Durum:** Kullanıcı tarafından onaylandı (sohbet içinde), spec incelemesi bekleniyor
**Proje klasörü:** `pdf-cevirmen/`

## 1. Amaç

Herkesin ücretsiz kullanabileceği, hızlı ve kaliteli bir PDF çeviri web uygulaması.
Öncelikli senaryo İngilizce → Türkçe; mimari her dilden her dile çeviriyi destekler.
Geliştiriciye ve kullanıcıya sıfır maliyet: sunucu yok, veritabanı yok, abonelik yok.

**Başarı kriterleri:**

- 100 sayfalık metin tabanlı bir PDF, varsayılan motorla birkaç dakika içinde çevrilir
  (tarayıcıda yerel model çalıştırma yaklaşımının "on binlerce dakika" sorunu tamamen ortadan kalkar).
- Çıktı PDF'te görseller, tablolar ve sayfa düzeni korunur; çeviri orijinal metnin yerine yerleşir.
- Uygulama tek bir statik site olarak GitHub Pages'te yayınlanır; işletme maliyeti 0 TL.
- Taranmış PDF, ağ hatası, dev dosya gibi durumlarda uygulama çökmez; net Türkçe mesaj verir.

## 2. Mimari genel bakış

Tamamen istemci tarafında (kullanıcının tarayıcısında) çalışan statik tek sayfa uygulaması (SPA).

```
Kullanıcı tarayıcısı
 ├── PDF okuma ve metin çıkarma        → pdf.js (Mozilla, Apache-2.0)
 ├── Blok gruplama + parçalama          → kendi TypeScript modüllerimiz
 ├── Çeviri istekleri                   → Google gtx / Lingva / Gemini (HTTPS, CORS)
 ├── Sayfa görüntüsü + maskeleme        → canvas
 └── Çıktı PDF üretimi                  → pdf-lib + @pdf-lib/fontkit (MIT)
```

- PDF dosyası hiçbir sunucuya yüklenmez; yalnızca çevrilecek metin parçaları çeviri
  servisine gider. Bu, arayüzdeki gizlilik notunda açıkça belirtilir.
- Her kullanıcı istekleri kendi IP'sinden attığı için merkezi kota/maliyet sorunu yoktur.

**Teknoloji:** Vite + TypeScript, framework yok (sade DOM). Bağımlılıklar: `pdfjs-dist`,
`pdf-lib`, `@pdf-lib/fontkit`. Font: Noto Sans Regular + Bold (OFL lisansı, repoya gömülür;
Latin, Kiril ve Yunan alfabelerini kapsar, Türkçe karakterlerin tamamı desteklenir).

## 3. Çeviri motorları

Ortak arayüz: `TranslationEngine.translateBatch(bloklar: string[], kaynak, hedef): Promise<string[]>`

### 3.1 GoogleGtxEngine (varsayılan, anahtarsız)

- Uç nokta: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=<kaynak>&tl=<hedef>&dt=t&q=<metin>`
- Bloklar `\n` ile birleştirilerek istek başına ≤ 4.500 karakterlik parçalar halinde gönderilir.
- Yanıt segmentleri birleştirilip `\n` sayısına göre bloklara geri bölünür.
  **Sayı uyuşmazsa** o parça bloklarına ayrılıp tek tek yeniden çevrilir (sessiz bozulma yok).
- Eşzamanlılık: 6 paralel istek; 429/5xx yanıtında üstel geri çekilme (1s→2s→4s, 3 deneme).
- Uygulamanın ilk açılışında motor tek cümlelik bir sağlık kontrolü yapar; uç nokta
  erişilemezse otomatik olarak yedek zincire geçilir.

### 3.2 Yedek zincir: LingvaEngine

- Halka açık Lingva örnekleri (ör. `lingva.ml` ve yapılandırılabilir yedek liste) üzerinden
  aynı Google çevirisine erişir. Arayüz aynı; gtx başarısız olursa devreye girer.
- MyMemory bilinçli olarak dahil edilmedi (anonim günlük kota çok düşük, kalite düşük).

### 3.3 GeminiEngine (isteğe bağlı, en yüksek kalite)

- Kullanıcı Google AI Studio'dan aldığı **ücretsiz** API anahtarını ayarlar panelinden girer;
  anahtar yalnızca `localStorage`'da tutulur, hiçbir yere gönderilmez (yalnızca Google'ın
  resmî `generativelanguage.googleapis.com` uç noktasına, CORS resmî olarak açık).
- Model: `gemini-flash-latest` (hız/kalite dengesi). İstek başına bir sayfalık bloklar,
  `⟦N⟧` numaralı işaretleyicilerle tek gövdede gönderilir; sistem yönergesi "yalnızca çevir,
  işaretleyicileri koru" der. Yanıtta işaretleyici sayısı doğrulanır; uyuşmazlıkta bloklar
  tek tek gönderilir.
- Ücretsiz kota sınırına (dakikadaki istek) uyum: motor kendi hız sınırlayıcısını kullanır;
  kota aşımında kullanıcıya "Gemini kotası doldu, Google motoruyla devam edilsin mi?" seçeneği sunulur.

### 3.4 Dil desteği

- Kaynak dil: otomatik algılama (`sl=auto`) + elle seçim listesi (tüm diller).
- Hedef dil: varsayılan Türkçe. v1'de hedef dil listesi Noto Sans'ın kapsadığı
  Latin/Kiril/Yunan alfabeli dillerle sınırlıdır (Arapça, Çince, Japonca, Korece,
  Hintçe gibi hedefler v2 — font ve metin şekillendirme gerektirir; kaynak dil olarak sorun yok).

## 4. PDF işleme hattı (sayfa başına)

1. **Metin çıkarma:** `page.getTextContent()` → konumlu metin öğeleri.
2. **Satır gruplama:** Aynı taban çizgisine (y toleransı ≈ yazı boyutunun %30'u) düşen
   öğeler soldan sağa sıralanıp satır yapılır.
3. **Blok (paragraf) gruplama:** Dikey boşluğu satır yüksekliğinin 1,6 katından küçük ve
   yatay olarak örtüşen satırlar tek blokta birleşir. Blok kaydı: metin, sınır kutusu (bbox),
   baskın yazı boyutu, kalınlık ipucu (font adında "Bold" geçiyorsa).
4. **Çevrilmeyecekleri ayıklama:** Yalnızca sayı/tarih/URL/e-posta/boşluk içeren bloklar ve
   2 karakterden kısa bloklar çeviriye gönderilmez, oldukları gibi korunur.
5. **Çeviri:** Bloklar seçili motora toplu gönderilir (Bölüm 3).
6. **Sayfa görüntüsü:** Sayfa canvas'a ölçek 2,0 ile (uzun kenar 3.000 piksel tavanıyla,
   eski donanımda bellek güvenliği için) çizilir.
7. **Maskeleme:** Her çevrilen bloğun bbox'ı, bloğun hemen dışından örneklenen arka plan
   rengiyle (örnekleme başarısızsa beyaz) doldurulur. Görseller ve çizimler bbox dışında
   kaldığı için aynen kalır.
8. **Yerleştirme:** Çeviri metni bbox içine sarılarak yazılır. Yazı boyutu orijinalden
   başlar, sığana kadar 0,5 pt adımlarla küçülür; taban 6 pt (altına inilmez, gerekirse
   blok en fazla %10 taşar). Renk: siyah; kalınlık ipucu varsa Noto Sans Bold.
9. **Çıktı sayfası:** Canvas JPEG (kalite 0,85) olarak pdf-lib sayfasına arka plan yapılır,
   çeviri metni gerçek (seçilebilir, aranabilir) metin olarak üzerine gömülür.

**İlerleme ve kontrol:** Sayfalar sırayla işlenir; her biten sayfa önizlemede anında görünür.
İlerleme çubuğu "sayfa X/Y" gösterir. İptal butonu `AbortController` ile tüm bekleyen
istekleri keser; o ana kadar biten sayfalar indirilebilir. Sayfa aralığı seçimi
("10–50 arasını çevir") yükleme sonrası sunulur.

**Görünüm:** Tek sütun önizleme varsayılan; "karşılaştır" düğmesi orijinal/çeviri sayfalarını
yan yana gösterir.

## 5. Hata yönetimi

| Durum | Davranış |
|---|---|
| Taranmış PDF (metin katmanı yok / sayfada < 3 metin öğesi) | Net mesaj: "Bu PDF taranmış görüntüden oluşuyor; v1 OCR desteklemiyor." Kısmen taranmışsa yalnızca metinli sayfalar çevrilir, diğerleri aynen kopyalanır ve raporlanır. |
| Ağ hatası / 429 / 5xx | Üstel geri çekilme ile 3 deneme; sonra motor yedeğine geçiş; o da olmazsa duraklat + "Yeniden dene" düğmesi. |
| Tek blok çevirisi başarısız | Blok orijinal haliyle bırakılır, sarı işaretle raporlanır; işlem devam eder. |
| Şifreli PDF | "Bu PDF parola korumalı" mesajı. |
| Bozuk PDF | pdf.js hatası yakalanır, "Dosya açılamadı" mesajı. |
| Dev dosya (> 300 sayfa veya > 100 MB) | Uyarı + sayfa aralığı seçmeye yönlendirme; engel yok. |
| Gemini kota aşımı | Kullanıcıya Google motoruyla devam seçeneği. |

Uygulama hiçbir hata durumunda beyaz ekrana düşmez; tüm hatalar Türkçe, eylem önerili
mesajlara çevrilir.

## 6. Arayüz (tek ekran)

1. **Başlangıç:** Sürükle-bırak alanı + dosya seç düğmesi; dil seçiciler (kaynak: otomatik,
   hedef: Türkçe); motor göstergesi; ayarlar (Gemini anahtarı); gizlilik notu.
2. **Önizleme/işlem:** Sayfa aralığı seçimi, ilerleme çubuğu, canlı sayfa önizlemesi,
   iptal düğmesi, karşılaştırma görünümü.
3. **Bitiş:** "Çevrilmiş PDF'i indir" + varsa çevrilemeyen blok raporu.

Arayüz dili Türkçe (metinler tek bir `strings.ts` dosyasında; ileride çok dilli arayüz kolay).
Mobil tarayıcıda da çalışır (duyarlı tasarım), ama birincil hedef masaüstüdür.

## 7. Test stratejisi

- **Birim testleri (Vitest, TDD):** satır/blok gruplama, parçalama ve `\n` geri bölme
  (uyuşmazlık dalları dahil), çevrilmeyecek blok ayıklama, kutuya sığdırma (küçültme/taşma),
  motor yanıt ayrıştırma (sahte HTTP ile), yedek zincir geçişi.
- **Fikstürler:** tek sütun makale, iki sütunlu akademik makale, görselli broşür, taranmış
  PDF, şifreli PDF, boş PDF.
- **Uçtan uca:** Geliştirme sırasında tarayıcı önizlemesiyle gerçek PDF'lerde elle doğrulama;
  yayın öncesi kullanıcının kendi makinesinde kabul testi.

## 8. Yayınlama

- Depo GitHub'da herkese açık, **MIT lisansı**.
- GitHub Actions ile her push'ta `vite build` + GitHub Pages dağıtımı (ücretsiz).
- Ürün adı: **PDF Çevirmen** (çalışma adı; yayın öncesi değiştirilebilir). Adda/markada
  "Google", "Gemini" gibi ticari markalar kullanılmaz; motorlar arayüzde yalnızca
  bilgilendirme amaçlı anılır.
- Analitik yok, hesap yok, çerez yok.

## 9. Riskler ve karşılıklar

| Risk | Karşılık |
|---|---|
| gtx uç noktası resmî değil; Google kısıtlayabilir | Lingva yedek zinciri + Gemini BYOK; motor katmanı soyut, yeni motor eklemek tek dosya. |
| Blok gruplama karmaşık düzenlerde hata yapabilir | Fikstür çeşitliliği + birim testleri; hatalı blok en kötü ihtimalle orijinal kalır, çıktı bozulmaz. |
| Türkçe metin uzaması taşma yaratır | Otomatik küçültme + %10 kontrollü taşma payı + 6 pt taban. |
| Eski donanımda canvas bellek sınırı | Ölçek tavanı (3.000 px) + sayfaların sırayla işlenmesi + canvas'ların hemen serbest bırakılması. |
| Çıktı PDF'in görüntü tabanlı olması dosyayı büyütür | JPEG 0,85 kalite; tipik 100 sayfalık metin PDF'i ~20–40 MB çıktı verir; v2'de vektörel arka plan araştırılır. |

## 10. Kapsam dışı (v1)

- Taranmış PDF için OCR (v2 adayı: isteğe bağlı Tesseract.js).
- Arapça/CJK/Hint alfabeli **hedef** diller (kaynak olarak sorun yok).
- DOCX/EPUB girişi; renkli metin renginin korunması; vektörel (görüntüsüz) çıktı.
- Kullanıcı hesabı, geçmiş, sunucu tarafı herhangi bir bileşen.
