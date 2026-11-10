# Brochure — Guida per il cittadino

Volantino/guida per chi usa Guardia nel Cuore (**4 pagine A4**, cioè 2 fogli
fronte/retro). Copertina con logo dell'associazione, iPhone con la Bacheca e
**QR code** verso `https://feed.guardianelcuore.it`.

| File | Cos'è |
|---|---|
| [`guida-cittadino.html`](guida-cittadino.html) | **Sorgente principale**, A4 210×297 mm. HTML autonomo (logo incorporato, nessuna dipendenza esterna) |
| [`guida-cittadino-tipografia.html`](guida-cittadino-tipografia.html) | Stesso contenuto con **3 mm di abbondanza** per lato (foglio 216×303, rifilo a 210×297), per la tipografia |
| [`pdf/Locandina-STAMPA-A4.pdf`](pdf/) | PDF A4, per stampante di casa/ufficio |
| [`pdf/Locandina-TIPOGRAFIA-abbondanza-3mm.pdf`](pdf/) | PDF **da mandare in tipografia** (senza crocini di taglio) |
| `assets/logo-trasparente.png` | Logo ritagliato su sfondo trasparente (2259 px) |
| `assets/qr-feed.guardianelcuore.it.svg` / `.png` | QR code, correzione d'errore **H** (massima) |
| `assets/anteprima-copertina.png` | Copertina in immagine, per social/WhatsApp |

⚠️ **La versione tipografia è la A4 più un blocco CSS in fondo allo `<style>`**
(«Abbondanza tipografica 3 mm»): ogni modifica al contenuto va fatta in **entrambi**
i file, oppure si rigenera la tipografia copiando la A4 e riaggiungendo quel blocco.

## Come ottenere i PDF
Apri l'HTML nel browser → **Stampa** (⌘P) → **Salva come PDF**, margini **Nessuno**,
e attiva **"Grafica di sfondo"** (per i colori).

Oppure da riga di comando con Chrome (headless), come sono stati generati:
```bash
B="$PWD/docs/brochure"; C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$C" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=3000 \
  --print-to-pdf="$B/pdf/Locandina-STAMPA-A4.pdf" "file://$B/guida-cittadino.html"
"$C" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=3000 \
  --print-to-pdf="$B/pdf/Locandina-TIPOGRAFIA-abbondanza-3mm.pdf" "file://$B/guida-cittadino-tipografia.html"
```

## Qualità di stampa (perché il sorgente è fatto così)

- **Font Helvetica Neue**, non il font di sistema (`-apple-system` / SF Pro): SF è un
  font *variabile* e Chrome lo incorpora come **Type 3**, che molte tipografie
  rifiutano. Helvetica Neue finisce nel PDF come TrueType incorporato.
  Verifica: `pdffonts <file>.pdf` → nessuna riga `Type 3`.
- **Niente emoji** (📷, ❤️, ▮▮▮): Chrome le incorpora come bitmap (Apple Color Emoji)
  che in stampa si sgranano. Al loro posto ci sono piccoli SVG inline.
- **Logo a piena risoluzione** (~700 ppi a 82 mm). Verifica: `pdfimages -list`.
- Tutto il resto (testo, mockup, QR) è **vettoriale**.
- Colori in **RGB**: la tipografia converte in CMYK; il rosso `#C0392B` può uscire
  meno acceso. Se conta, chiedere una prova colore.

## QR code

Il QR è un SVG incorporato nella copertina. Per rigenerarlo (es. se cambia dominio):
```bash
python3 -m venv /tmp/qr && /tmp/qr/bin/pip -q install segno
/tmp/qr/bin/python -c "import segno; q=segno.make('https://feed.guardianelcuore.it', error='h'); \
  q.save('qr.svg', scale=10, border=0, dark='#2B2321', xmldecl=False, omitsize=True)"
```
`border=0` perché la zona di rispetto bianca la dà il riquadro `.qr-card` (padding 20px).
**Dopo ogni modifica, leggere il QR dal PDF**, non fidarsi del sorgente: renderizzare la
copertina (`pdftoppm -r 300 -png -f 1 -l 1 …`) e decodificarla (es. OpenCV
`QRCodeDetector`, o il telefono su una stampa).

## ⚠️ Esiste anche nell'app

Lo stesso contenuto è una **pagina pubblica** dell'app: `/guida`
(`frontend/projects/client/src/app/features/guida/`), raggiungibile senza
registrarsi come regolamento e privacy.

**Il markup NON è condiviso**, e non per pigrizia: questo file è un documento A4 con
larghezza fissa in millimetri e mockup a pixel fissi, che su un telefono scorrerebbe
in orizzontale. La pagina web usa i componenti dell'app ed è responsive.

⚠️ **Sono due copie dello stesso contenuto: vanno cambiate INSIEME.** È esattamente
così che questa brochure si è riempita di tre errori fra luglio e agosto. Le guardie
in `features/documenti.spec.ts` proteggono la pagina web (segnaposto, data di
aggiornamento, recapito, numerazione) ma **non possono accorgersi** che questo file
dice una cosa diversa. (Controllo del 10/11/2026: le due copie e l'app coincidono.)

## ⚠️ Vincolo di impaginazione

Ogni `<section class="page">` deve stare **entro 1123px** nella A4 (l'altezza di un
A4 a 96dpi) ed **entro 1145px** nella tipografia (303 mm). Superarli anche **di un
solo pixel** non produce alcun errore: nella A4 `break-after: page` manda la coda
della pagina su un foglio nuovo (foglio quasi bianco in mezzo); nella tipografia, che
ha altezza fissa, la coda **viene tagliata in silenzio**. È già successo aggiungendo
due righe di didascalia, e di nuovo passando a Helvetica Neue (più larga di SF).

Dopo ogni modifica, misurare — non fidarsi dell'occhio. Questo stampa l'altezza
naturale di ogni pagina (inietta uno script in una copia e legge il `<title>`):
```bash
f=docs/brochure/guida-cittadino.html   # o guida-cittadino-tipografia.html
sed 's#</body>#<script>document.title=[...document.querySelectorAll(".page")].map(p=>{p.style.height="auto";p.style.minHeight="0";return Math.round(p.getBoundingClientRect().height)}).join(",")</script></body>#' \
  "$f" > /tmp/misura.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --virtual-time-budget=3000 --dump-dom file:///tmp/misura.html | grep -o '<title>[^<]*</title>'
```
E il PDF deve avere esattamente 4 pagine (`pdfinfo <file>.pdf | grep Pages`).

La pagina "Cosa puoi fare" è la più stretta di margine: usa `.pad.tight` (10mm
invece di 20mm) proprio per questo. Se serve spazio, accorciare le didascalie
prima di toccare i mockup.

## Note
- Le schermate dell'app (anche l'iPhone in copertina) sono **illustrazioni fedeli**
  ricreate in HTML/CSS, **non screenshot**: la bacheca vera mostra nomi di cittadini
  veri, che su un volantino stampato non vanno. I nomi nei mockup sono inventati.
- La notifica in copertina riprende l'oggetto vero dell'email di pubblicazione
  (`backend/src/handlers/patch-feedback.ts`): se cambia lì, cambiarla anche qui.
- Niente ombre (`box-shadow`) sugli elementi: Chrome le rasterizza come
  rettangoli grigi in alcuni visualizzatori PDF.
- **Pagina condivisibile**: <https://claude.ai/code/artifact/7d67dc8d-01b5-4077-81ab-d0790d65e7ea>
  — ⚠️ è ancora l'**edizione agosto 2026** (senza logo, iPhone e QR). Per
  pubblicarla va rimosso l'involucro `<!doctype html>…<body>`, che l'hosting
  aggiunge da sé: la copia pubblicata si genera dal sorgente, non si modifica a mano.
