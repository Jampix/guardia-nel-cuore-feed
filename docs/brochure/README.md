# Brochure — Guida per il cittadino

Volantino/guida per i cittadini di Guardia nel Cuore (3 pagine A4).

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

## Note
- Le schermate dell'app sono **illustrazioni fedeli** ricreate in HTML/CSS
  (non screenshot catturati), coerenti con l'interfaccia reale.
- Niente ombre (`box-shadow`) sugli elementi: Chrome le rasterizza come
  rettangoli grigi in alcuni visualizzatori PDF.
- Per revisioni: modificare l'HTML e rigenerare il PDF con il comando sopra.
