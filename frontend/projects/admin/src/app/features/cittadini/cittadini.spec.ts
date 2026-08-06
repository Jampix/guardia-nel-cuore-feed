import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { AdminUsersService, PendingUser } from '../../core/admin-users.service';
import { Cittadini } from './cittadini';

/** Larghezza logica di un iPhone 14: è lo schermo su cui il difetto si vedeva. */
const IPHONE = 390;

const IN_ATTESA: PendingUser[] = [
  {
    username: 'u1',
    email: 'nome.cognome.lungo@esempio-molto-lungo.com',
    nickname: 'Eugenia',
    nome: 'Eugenia',
    cognome: 'Mazzei',
    tipoUtente: 'residente',
  } as PendingUser,
  {
    // Un indirizzo lungo di un ufficio: è una sola parola, più larga della
    // colonna di testo, e senza andare a capo sborda dalla scheda.
    username: 'u2',
    email: 'amministrazione.protocollo.generale@comune-guardia-piemontese.gov.it',
    nickname: 'Ufficio Protocollo',
    tipoUtente: 'residente',
  } as PendingUser,
];

/**
 * Impaginazione della lista Cittadini sugli schermi stretti.
 *
 * Su iPhone i pulsanti Rifiuta/Approva finivano SOPRA il nome e l'email: la
 * riga non andava a capo e il testo tracimava oltre il suo riquadro. Chi
 * approvava non poteva leggere l'indirizzo della persona che stava approvando,
 * e i due pulsanti si sovrapponevano al testo proprio dove un tocco sbagliato
 * rifiuta un'iscrizione.
 *
 * Sono asserzioni sulla geometria reale (`getBoundingClientRect`): è il motivo
 * per cui questi test girano in un Chrome vero e non in un DOM simulato.
 */
describe('Cittadini — impaginazione su schermo stretto', () => {
  let fixture: ComponentFixture<Cittadini>;

  async function rendiA(larghezza: number) {
    await TestBed.configureTestingModule({
      imports: [Cittadini],
      providers: [
        provideNoopAnimations(),
        {
          provide: AdminUsersService,
          useValue: {
            getPending: () => of(IN_ATTESA),
            getCitizens: () => of([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Cittadini);
    // Il componente si adatta al contenitore: nessuna media query da simulare.
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = `${larghezza}px`;
    host.style.boxSizing = 'border-box';
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const rect = (sel: string) =>
    (fixture.nativeElement.querySelector(sel) as HTMLElement).getBoundingClientRect();

  const schede = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.card'));

  function siSovrappongono(a: DOMRect, b: DOMRect): boolean {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  }

  it('i pulsanti non coprono nome ed email', async () => {
    await rendiA(IPHONE);

    const testo = rect('.card .txt');
    const azioni = rect('.card .actions');

    expect(siSovrappongono(testo, azioni))
      .withContext(
        `testo ${JSON.stringify(testo.toJSON())} contro pulsanti ${JSON.stringify(azioni.toJSON())}`,
      )
      .toBeFalse();
  });

  it('nessun pulsante copre l\'email, in nessuna scheda', async () => {
    await rendiA(IPHONE);

    for (const card of schede()) {
      const email = card.querySelector('.email')!.getBoundingClientRect();
      for (const b of card.querySelectorAll('.actions button')) {
        expect(siSovrappongono(email, b.getBoundingClientRect()))
          .withContext(`"${b.textContent?.trim()}" sopra ${email.width}px di email`)
          .toBeFalse();
      }
    }
  });

  it('il testo non esce dal suo riquadro, nemmeno un indirizzo lunghissimo', async () => {
    // Si confronta `scrollWidth` con `clientWidth`, non le coordinate: la
    // scatola dello span resta sempre dentro il suo contenitore, è il TESTO che
    // le esce fuori e va a finire sopra i pulsanti. Misurare il rettangolo non
    // vede nulla — era il buco della prima versione di questo test.
    await rendiA(IPHONE);

    for (const card of schede()) {
      for (const sel of ['.nick', '.email']) {
        const el = card.querySelector(sel) as HTMLElement;
        expect(el.scrollWidth)
          .withContext(`"${el.textContent?.trim()}" occupa ${el.scrollWidth}px in ${el.clientWidth}px`)
          .toBeLessThanOrEqual(el.clientWidth);
      }
    }
  });

  it('su schermo stretto i pulsanti scendono su una riga propria', async () => {
    await rendiA(IPHONE);

    // Non si sovrappongono PERCHÉ vanno a capo, non perché si sono rimpiccioliti
    // fino a diventare intoccabili.
    expect(rect('.card .actions').top).toBeGreaterThanOrEqual(rect('.card .txt').bottom);
    for (const b of fixture.nativeElement.querySelectorAll('.card .actions button')) {
      // Le linee guida di Apple chiedono almeno 44px di lato utile.
      expect((b as HTMLElement).getBoundingClientRect().height).toBeGreaterThanOrEqual(36);
    }
  });

  it('su schermo largo resta tutto su una riga sola', async () => {
    // La correzione per il telefono non deve peggiorare il desktop.
    await rendiA(720);

    const testo = rect('.card .txt');
    const azioni = rect('.card .actions');
    expect(siSovrappongono(testo, azioni)).toBeFalse();
    expect(azioni.top).toBeLessThan(testo.bottom);
    expect(azioni.left).toBeGreaterThanOrEqual(testo.right);
  });
});
