import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Feedback } from 'shared';
import { AdminFeedbackService } from '../../core/admin-feedback.service';
import { FeedbackList } from './feedback-list';

/**
 * Test della lista Feedback del backoffice: visibilità e stato sono due assi
 * indipendenti e devono restare combinabili, e i filtri devono poter arrivare
 * dai KPI della Sintesi tramite query param.
 */

function feedback(over: Partial<Feedback>): Feedback {
  return {
    id: 'x',
    titolo: 'Titolo',
    descrizione: '',
    categoriaId: 'c1',
    autoreId: 'a1',
    autoreNick: 'Tizio',
    stato: 'proposta',
    visibilita: 'privato',
    numeroVoti: 0,
    segnalazioni: 0,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...over,
  } as Feedback;
}

const DATI: Feedback[] = [
  feedback({ id: '1', visibilita: 'pubblico', stato: 'proposta' }),
  feedback({ id: '2', visibilita: 'pubblico', stato: 'risolto' }),
  feedback({ id: '3', visibilita: 'privato', stato: 'proposta', segnalazioni: 2 }),
  feedback({ id: '4', visibilita: 'privato', stato: 'archiviato' }),
  feedback({ id: '5', visibilita: 'privato', stato: 'risolto' }),
];

describe('FeedbackList', () => {
  let fixture: ComponentFixture<FeedbackList>;
  let comp: FeedbackList;

  async function setup(inputs: Record<string, string> = {}) {
    await TestBed.configureTestingModule({
      imports: [FeedbackList],
      providers: [
        provideNoopAnimations(),
        provideRouter([{ path: '**', children: [] }]),
        { provide: AdminFeedbackService, useValue: { getAll: () => of(DATI) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedbackList);
    comp = fixture.componentInstance;
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const ids = () => comp.feedbacks().map((f) => f.id);

  describe('conteggi', () => {
    beforeEach(async () => setup());

    it('conta le pubbliche e le non pubblicate', () => {
      expect(comp.publicCount()).toBe(2);
      expect(comp.privateCount()).toBe(3);
    });

    it('conta le segnalate', () => {
      expect(comp.reportedCount()).toBe(1);
    });

    it('i conteggi coprono tutte le proposte', () => {
      // Invariante: pubbliche + non pubblicate = totale. Se un giorno la
      // visibilità ammettesse un terzo valore, questo test lo scopre.
      expect(comp.publicCount() + comp.privateCount()).toBe(DATI.length);
    });
  });

  describe('filtro visibilità', () => {
    beforeEach(async () => setup());

    it('senza filtro mostra tutto', () => {
      expect(ids().length).toBe(5);
    });

    it('mostra solo le pubbliche', () => {
      comp.setVisFilter('pubbliche');
      expect(ids()).toEqual(['1', '2']);
    });

    it('mostra solo le non pubblicate', () => {
      comp.setVisFilter('private');
      expect(ids()).toEqual(['3', '4', '5']);
    });

    it('si combina col filtro di stato (assi indipendenti)', () => {
      // Il punto della funzionalità: una `risolto` può essere ancora privata.
      comp.setVisFilter('private');
      comp.setFilter('risolto');
      expect(ids()).toEqual(['5']);
    });

    it('si combina col filtro delle segnalazioni', () => {
      comp.setVisFilter('private');
      comp.toggleReported();
      expect(ids()).toEqual(['3']);
    });
  });

  describe('filtri iniziali dai KPI della Sintesi (query param)', () => {
    it('`vis=private` apre la lista già filtrata', async () => {
      await setup({ vis: 'private' });
      expect(comp.visFilter()).toBe('private');
      expect(ids()).toEqual(['3', '4', '5']);
    });

    it('`vis=pubbliche` apre la lista già filtrata', async () => {
      await setup({ vis: 'pubbliche' });
      expect(comp.visFilter()).toBe('pubbliche');
      expect(ids()).toEqual(['1', '2']);
    });

    it('`segnalati=1` attiva il filtro delle segnalazioni', async () => {
      await setup({ segnalati: '1' });
      expect(comp.onlyReported()).toBeTrue();
      expect(ids()).toEqual(['3']);
    });

    it('un valore non riconosciuto non filtra nulla', async () => {
      await setup({ vis: 'qualcosa' });
      expect(comp.visFilter()).toBe('tutte');
      expect(ids().length).toBe(5);
    });

    it('il filtro dal query param non blocca le scelte successive dell\'utente', async () => {
      await setup({ vis: 'private' });
      comp.setVisFilter('pubbliche');
      expect(ids()).toEqual(['1', '2']);
    });
  });

  describe('badge di visibilità', () => {
    it('ogni riga dichiara la propria visibilità, anche le pubbliche', async () => {
      // Prima le pubbliche non avevano alcun segno e si riconoscevano solo
      // per assenza del lucchetto: il badge deve esserci su OGNI riga.
      await setup();
      const badges = fixture.nativeElement.querySelectorAll('.list .card .vis');
      expect(badges.length).toBe(DATI.length);

      const pub = fixture.nativeElement.querySelectorAll('.list .card .vis.pub');
      const priv = fixture.nativeElement.querySelectorAll('.list .card .vis.priv');
      expect(pub.length).toBe(2);
      expect(priv.length).toBe(3);
    });
  });
});
