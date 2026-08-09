# Brochure — Guida per il cittadino

Volantino/guida per chi usa Guardia nel Cuore (**4 pagine A4**, cioè 2 fogli
fronte/retro).

- **Sorgente**: [`guida-cittadino.html`](guida-cittadino.html) — file HTML autonomo
  (nessuna dipendenza esterna). Si apre e si stampa direttamente da qualsiasi browser.

## Come ottenere il PDF
Apri `guida-cittadino.html` nel browser → **Stampa** (⌘P) → **Salva come PDF**,
formato **A4**, margini **Nessuno**, e attiva **"Grafica di sfondo"** (per i colori).

Oppure da riga di comando con Chrome (headless), come è stato generato:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=3000 \
  --print-to-pdf="Guida-Cittadino.pdf" \
  "file://$PWD/docs/brochure/guida-cittadino.html"
```

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
dice una cosa diversa.

## ⚠️ Vincolo di impaginazione

Ogni `<section class="page">` deve stare **entro 1123px** (l'altezza di un A4 a
96dpi). Superarli anche **di un solo pixel** non produce alcun errore: `break-after:
page` manda la coda della pagina su un foglio nuovo, e ne esce una stampa con un
foglio quasi bianco in mezzo. È già successo aggiungendo due righe di didascalia.

Dopo ogni modifica al testo, misurare — non fidarsi dell'occhio:

```bash
# 1) il PDF deve avere esattamente 4 pagine
python3 - <<'EOF'
import zlib, re, pathlib
d = pathlib.Path('Guida-Cittadino.pdf').read_bytes(); tot = 0
for m in re.finditer(rb'stream\r?\n(.*?)endstream', d, re.S):
    try: tot += len(re.findall(rb'/Type\s*/Page[^s]', zlib.decompress(m.group(1))))
    except Exception: pass
print('pagine:', tot + len(re.findall(rb'/Type\s*/Page[^s]', d)))
EOF
```

La pagina "Cosa puoi fare" è la più stretta di margine: usa `.pad.tight` (11mm
invece di 20mm) proprio per questo. Se serve spazio, accorciare le didascalie
prima di toccare i mockup.

## Note
- Le schermate dell'app sono **illustrazioni fedeli** ricreate in HTML/CSS
  (non screenshot catturati), coerenti con l'interfaccia reale.
- Niente ombre (`box-shadow`) sugli elementi: Chrome le rasterizza come
  rettangoli grigi in alcuni visualizzatori PDF.
- Per revisioni: modificare l'HTML, **rimisurare** (vedi sopra) e rigenerare il PDF.
- **Pagina condivisibile**: <https://claude.ai/code/artifact/7d67dc8d-01b5-4077-81ab-d0790d65e7ea>
  (edizione agosto 2026). ⚠️ Il link della prima edizione, luglio 2026, **non
  esiste più**: non era aggiornabile, quindi questo è nuovo.
- Il file è anche pubblicato come pagina condivisibile. ⚠️ Per pubblicarlo va
  rimosso l'involucro `<!doctype html>…<body>`, che l'hosting aggiunge da sé:
  è la ragione per cui la copia pubblicata si genera dal sorgente e non si
  modifica a mano.
