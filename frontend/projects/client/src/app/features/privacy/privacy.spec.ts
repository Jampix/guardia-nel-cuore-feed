import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Privacy } from './privacy';

/**
 * L'informativa è un documento legale: i difetti che conta fermare non sono
 * eccezioni a runtime ma testo sbagliato che nessuno nota per settimane.
 * È già accaduto: i dati del titolare sono rimasti come segnaposto fra
 * parentesi quadre dalla pubblicazione dell'app fino ad agosto.
 */
describe('Privacy (informativa)', () => {
  let fixture: ComponentFixture<Privacy>;
  let root: HTMLElement;
  let testo: string;
  let html: string;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Privacy],
      providers: [provideRouter([{ path: '**', children: [] }])],
    }).compileComponents();

    fixture = TestBed.createComponent(Privacy);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
    testo = root.textContent ?? '';
    html = root.innerHTML;
  });

  it('non contiene segnaposto da compilare', () => {
    // Cerca [qualcosa] nel testo visibile: è la forma usata nella bozza
    // ([indirizzo], [C.F./P.IVA], [DATA]). Le parentesi quadre non compaiono
    // mai nella prosa italiana dell'informativa, quindi non ci sono falsi
    // positivi da tollerare.
    const segnaposto = testo.match(/\[[^\]]+\]/g);
    expect(segnaposto).withContext(`segnaposto residui: ${segnaposto}`).toBeNull();
  });

  it('non si presenta più come bozza da validare', () => {
    expect(testo).not.toMatch(/bozza/i);
    expect(testo).not.toMatch(/da far validare/i);
  });

  it('identifica il titolare e dà un contatto scrivibile', () => {
    // Senza questi tre elementi l'informativa non assolve il suo scopo:
    // chi legge non sa a chi appartengono i suoi dati né a chi rivolgersi.
    expect(testo).toContain('Guardia nel Cuore');
    expect(testo).toContain('96055780785');
    expect(testo).toContain('Guardia Piemontese');

    const contatto = root.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
    expect(contatto).withContext('manca il recapito del titolare').not.toBeNull();
    expect(contatto!.href).toContain('@');
  });

  it('numera le sezioni senza salti né ripetizioni', () => {
    // Le sezioni sono state rinumerate a mano quando ne è stata inserita una
    // in mezzo: un doppione o un buco non fa fallire nulla, si vede solo
    // leggendo.
    const numeri = Array.from(
      root.querySelectorAll<HTMLElement>('h2'),
      (h) => Number((h.textContent ?? '').match(/^\s*(\d+)\./)?.[1]),
    );

    expect(numeri.length).toBeGreaterThan(5);
    expect(numeri).withContext('un h2 non inizia con "N."').not.toContain(NaN);
    expect(numeri).toEqual(numeri.map((_, i) => i + 1));
  });

  it('i rimandi interni puntano a una sezione che esiste', () => {
    // Il difetto vero della rinumerazione: "(vedi punto 6)" che dopo
    // l'inserimento di una sezione indica il paragrafo sbagliato. Il lettore
    // viene mandato a leggere altro, e il documento perde valore proprio dove
    // spiega come esercitare i diritti.
    const sezioni = root.querySelectorAll('h2').length;
    const rimandi = Array.from(testo.matchAll(/punto\s+(\d+)/g), (m) => Number(m[1]));

    expect(rimandi.length).withContext('nessun rimando trovato: regex da rivedere').toBeGreaterThan(0);
    for (const n of rimandi) {
      expect(n).withContext(`rimando "punto ${n}" oltre le ${sezioni} sezioni`).toBeLessThanOrEqual(sezioni);
      expect(n).toBeGreaterThan(0);
    }
  });

  it('il rimando alla cancellazione porta alla sezione dei diritti', () => {
    // Il caso concreto: il punto 4 rimanda alla cancellazione dell'account,
    // che è spiegata nella sezione "I tuoi diritti". Verificare solo che il
    // numero esista non basta — deve indicare QUELLA sezione.
    const diritti = Array.from(root.querySelectorAll<HTMLElement>('h2')).findIndex((h) => /I tuoi diritti/i.test(h.textContent ?? ''));
    expect(diritti).withContext('sezione "I tuoi diritti" non trovata').toBeGreaterThanOrEqual(0);

    const atteso = diritti + 1;
    expect(testo).toContain(`vedi punto ${atteso}`);
  });

  it('dichiara OpenStreetMap fra i destinatari', () => {
    // La mappa manda l'IP di chi legge a un terzo a ogni apertura: se non è
    // scritto qui, non è stato dichiarato da nessuna parte.
    expect(testo).toContain('OpenStreetMap');
    expect(html).toMatch(/indirizzo IP/);
  });
});
