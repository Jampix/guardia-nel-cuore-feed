import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Type } from '@angular/core';

import { Privacy } from './privacy/privacy';
import { Regolamento } from './regolamento/regolamento';

/**
 * Invarianti comuni ai documenti pubblici (informativa e regolamento).
 *
 * Sono testi che vincolano i cittadini e che l'app fa accettare in fase di
 * iscrizione: i difetti che contano non sono eccezioni a runtime ma frasi
 * sbagliate che restano pubblicate per settimane senza che nulla si rompa. È
 * già accaduto — i dati del titolare sono rimasti fra parentesi quadre dal
 * lancio dell'app fino ad agosto, e i due documenti si sono presentati come
 * bozze anche dopo essere stati confermati.
 *
 * Parametrico di proposito: un solo posto da estendere quando si aggiunge un
 * terzo documento.
 */
const DOCUMENTI: { nome: string; componente: Type<unknown> }[] = [
  { nome: 'Informativa privacy', componente: Privacy },
  { nome: 'Regolamento', componente: Regolamento },
];

for (const { nome, componente } of DOCUMENTI) {
  describe(nome, () => {
    let root: HTMLElement;
    let testo: string;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [componente],
        providers: [provideRouter([{ path: '**', children: [] }])],
      }).compileComponents();

      const fixture = TestBed.createComponent(componente);
      fixture.detectChanges();
      root = fixture.nativeElement as HTMLElement;
      testo = root.textContent ?? '';
    });

    it('non contiene segnaposto da compilare', () => {
      // Cerca [qualcosa] nel testo visibile: è la forma usata nelle bozze
      // ([indirizzo], [C.F./P.IVA], [DATA]). Le parentesi quadre non compaiono
      // nella prosa italiana di questi documenti, quindi nessun falso positivo.
      const segnaposto = testo.match(/\[[^\]]+\]/g);
      expect(segnaposto).withContext(`segnaposto residui: ${segnaposto}`).toBeNull();
    });

    it('non si presenta come bozza', () => {
      expect(testo).not.toMatch(/bozza/i);
      expect(testo).not.toMatch(/da far validare|prima della pubblicazione/i);
    });

    it('dichiara la data di ultimo aggiornamento', () => {
      // Un documento che vincola chi lo accetta deve dire da quando vale:
      // altrimenti nessuno può sapere se sta leggendo la versione accettata.
      expect(root.querySelector('.updated')?.textContent ?? '').toMatch(
        /ultimo aggiornamento:\s*\d/i,
      );
    });

    it('dà un recapito scrivibile', () => {
      // Entrambi i documenti mandano il lettore a scrivere all'associazione: se
      // l'indirizzo non c'è, il rimando è un vicolo cieco.
      const contatto = root.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
      expect(contatto).withContext('nessun recapito nel documento').not.toBeNull();
      expect(contatto!.href).toContain('@');
    });

    it('numera le sezioni senza salti né ripetizioni', () => {
      // Le sezioni si rinumerano a mano quando se ne inserisce una in mezzo: un
      // doppione o un buco non fa fallire nulla, si vede solo leggendo.
      const numeri = Array.from(
        root.querySelectorAll<HTMLElement>('h2'),
        (h) => Number((h.textContent ?? '').match(/^\s*(\d+)\./)?.[1]),
      );

      expect(numeri.length).toBeGreaterThan(4);
      expect(numeri).withContext('un h2 non inizia con "N."').not.toContain(NaN);
      expect(numeri).toEqual(numeri.map((_, i) => i + 1));
    });

    it('i rimandi interni puntano a una sezione che esiste', () => {
      // Il difetto vero della rinumerazione: "(vedi punto 6)" che dopo
      // l'inserimento di una sezione indica il paragrafo sbagliato, e manda a
      // leggere altro proprio dove si spiega come agire.
      const sezioni = root.querySelectorAll('h2').length;
      for (const m of testo.matchAll(/punto\s+(\d+)/g)) {
        const n = Number(m[1]);
        expect(n).withContext(`rimando "punto ${n}" oltre le ${sezioni} sezioni`).toBeLessThanOrEqual(sezioni);
        expect(n).toBeGreaterThan(0);
      }
    });
  });
}
