import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, Feedback } from 'shared';
import { AdminFeedbackService } from '../../core/admin-feedback.service';
import { FeedbackList } from '../feedback-list/feedback-list';
import { Sintesi } from './sintesi';

/** Dashboard di sintesi: i KPI devono essere coerenti con la lista che aprono. */

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
  feedback({ id: '1', visibilita: 'pubblico', stato: 'proposta', autoreId: 'a' }),
  feedback({ id: '2', visibilita: 'pubblico', stato: 'risolto', autoreId: 'b' }),
  feedback({ id: '3', visibilita: 'privato', stato: 'proposta', autoreId: 'c', segnalazioni: 2 }),
  // Archiviata e privata: il caso che ha fatto divergere KPI e lista.
  feedback({ id: '4', visibilita: 'privato', stato: 'archiviato', autoreId: 'c' }),
  feedback({ id: '5', visibilita: 'privato', stato: 'in_lavorazione', autoreId: 'd' }),
];

function providers() {
  return [
    provideNoopAnimations(),
    provideRouter([{ path: '**', children: [] }]),
    { provide: AdminFeedbackService, useValue: { getAll: () => of(DATI) } },
    { provide: AuthService, useValue: { user: signal({ nickname: 'Staff' }) } },
  ];
}

describe('Sintesi', () => {
  async function creaSintesi() {
    await TestBed.configureTestingModule({ imports: [Sintesi], providers: providers() })
      .compileComponents();
    const fixture = TestBed.createComponent(Sintesi);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('conta le proposte da moderare e quelle in lavorazione', async () => {
    const { componentInstance: c } = await creaSintesi();
    expect(c.daModerare()).toBe(2);
    expect(c.inLavorazione()).toBe(1);
  });

  it('conta i cittadini distinti', async () => {
    const { componentInstance: c } = await creaSintesi();
    expect(c.cittadini()).toBe(4);
  });

  it('conta le pubbliche e le non pubblicate', async () => {
    const { componentInstance: c } = await creaSintesi();
    expect(c.inBacheca()).toBe(2);
    expect(c.nonPubblicate()).toBe(3);
  });

  it('i KPI di visibilità sono cliccabili e portano alla lista filtrata', async () => {
    const fixture = await creaSintesi();
    const link = (q: string): HTMLAnchorElement | null =>
      fixture.nativeElement.querySelector(`a.stat[href*="${q}"]`);

    expect(link('vis=private')).withContext('KPI "Non pubblicate"').toBeTruthy();
    expect(link('vis=pubbliche')).withContext('KPI "In bacheca"').toBeTruthy();
    expect(link('segnalati=1')).withContext('KPI "Segnalati"').toBeTruthy();
  });

  it('il KPI mostra lo STESSO numero della lista che apre', async () => {
    // Regressione: il KPI escludeva le archiviate ("Da pubblicare 2") mentre il
    // filtro della lista le includeva (3). Un numero che non corrisponde a
    // quello che si vede dopo il clic rende inaffidabile la dashboard.
    const sintesi = (await creaSintesi()).componentInstance;

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [FeedbackList], providers: providers() })
      .compileComponents();
    const listaFixture = TestBed.createComponent(FeedbackList);
    const lista = listaFixture.componentInstance;
    listaFixture.detectChanges();
    await listaFixture.whenStable();

    expect(sintesi.nonPubblicate()).toBe(lista.privateCount());
    expect(sintesi.inBacheca()).toBe(lista.publicCount());

    lista.setVisFilter('private');
    expect(sintesi.nonPubblicate())
      .withContext('il numero del KPI coincide con le righe elencate')
      .toBe(lista.feedbacks().length);
  });
});
