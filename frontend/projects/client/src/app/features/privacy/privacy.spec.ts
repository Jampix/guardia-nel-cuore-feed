import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Privacy } from './privacy';

/**
 * Quello che deve dire QUESTO documento e nessun altro. Le invarianti comuni ai
 * documenti pubblici (segnaposto, "bozza", numerazione, rimandi, recapito) stanno
 * in `features/documenti.spec.ts`, parametriche su informativa e regolamento.
 */
describe('Privacy (contenuti propri)', () => {
  let fixture: ComponentFixture<Privacy>;
  let root: HTMLElement;
  let testo: string;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Privacy],
      providers: [provideRouter([{ path: '**', children: [] }])],
    }).compileComponents();

    fixture = TestBed.createComponent(Privacy);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
    testo = root.textContent ?? '';
  });

  it('identifica il titolare del trattamento', () => {
    // Senza questi elementi l'informativa non assolve il suo scopo: chi legge
    // non sa a chi appartengono i suoi dati né chi risponde delle sue richieste.
    expect(testo).toContain('Guardia nel Cuore');
    expect(testo).toContain('96055780785');
    expect(testo).toContain('Guardia Piemontese');
  });

  it('non pubblica il codice fiscale del legale rappresentante', () => {
    // Sta nel certificato dell'associazione ed è la cosa più facile da copiare
    // per sbaglio: identifica una persona, non l'ente, e questa è una pagina
    // pubblica e indicizzabile.
    expect(testo).not.toMatch(/PSNFNC/i);
    // Nessun codice fiscale di persona fisica (16 caratteri alfanumerici).
    expect(testo).not.toMatch(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/);
  });

  it('il rimando alla cancellazione porta alla sezione dei diritti', () => {
    // Verificare che il numero esista non basta (lo fa già la guardia comune):
    // deve indicare QUELLA sezione, altrimenti si manda a leggere altro proprio
    // dove si spiega come cancellare i propri dati.
    const diritti = Array.from(root.querySelectorAll<HTMLElement>('h2')).findIndex((h) =>
      /I tuoi diritti/i.test(h.textContent ?? ''),
    );
    expect(diritti).withContext('sezione "I tuoi diritti" non trovata').toBeGreaterThanOrEqual(0);
    expect(testo).toContain(`vedi punto ${diritti + 1}`);
  });

  it('dichiara OpenStreetMap fra i destinatari', () => {
    // La mappa manda l'IP di chi la apre a un terzo: se non è scritto qui, non è
    // stato dichiarato da nessuna parte.
    expect(testo).toContain('OpenStreetMap');
    expect(testo).toContain('indirizzo IP');
  });
});
