import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Type } from '@angular/core';

import { Privacy } from './privacy/privacy';
import { Regolamento } from './regolamento/regolamento';
import { Guida } from './guida/guida';

/**
 * Invarianti comuni alle pagine pubbliche (informativa, regolamento, guida).
 *
 * Sono testi che vincolano i cittadini e che l'app fa accettare in fase di
 * iscrizione: i difetti che contano non sono eccezioni a runtime ma frasi
 * sbagliate che restano pubblicate per settimane senza che nulla si rompa. È
 * già accaduto — i dati del titolare sono rimasti fra parentesi quadre dal
 * lancio dell'app fino ad agosto, e i due documenti si sono presentati come
 * bozze anche dopo essere stati confermati.
 *
 * Parametrico di proposito: un solo posto da estendere quando si aggiunge una
 * pagina pubblica.
 */
const DOCUMENTI: { nome: string; componente: Type<unknown> }[] = [
  { nome: 'Informativa privacy', componente: Privacy },
  { nome: 'Regolamento', componente: Regolamento },
  { nome: 'Guida', componente: Guida },
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

    it('«Indietro» riporta nell\'app, non alla schermata di accesso', () => {
      // Difetto vero, segnalato dall'utente: da PC, loggato come cittadino, apriva
      // la Guida e «Indietro» lo buttava sul login. La guida e la privacy
      // puntavano a /accedi, il regolamento a «/» — e «/» è la scelta che funziona
      // per entrambi i casi: per chi è dentro è la bacheca, per chi non lo è ci
      // pensa la guardia di rotta a mandarlo all'accesso.
      const back = root.querySelector<HTMLAnchorElement>('.p-nav .back');
      expect(back).withContext('manca il link Indietro').not.toBeNull();
      expect(back!.getAttribute('href'))
        .withContext('«Indietro» non deve portare alla schermata di accesso')
        .toBe('/');
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
      // Una sola asserzione, che viene eseguita SEMPRE: con un ciclo, un documento
      // senza rimandi non asseriva nulla e Karma lo segnalava come «spec senza
      // expectations» — un test che passa a vuoto.
      const sezioni = root.querySelectorAll('h2').length;
      const rimandi = [...testo.matchAll(/punto\s+(\d+)/g)].map((m) => Number(m[1]));
      const fuoriRange = rimandi.filter((n) => n < 1 || n > sezioni);

      expect(fuoriRange)
        .withContext(`rimandi fuori dalle ${sezioni} sezioni di questo documento`)
        .toEqual([]);
    });
  });
}
