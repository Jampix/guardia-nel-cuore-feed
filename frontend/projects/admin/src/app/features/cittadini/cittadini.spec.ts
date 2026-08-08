import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminUsersService, Citizen, PendingUser } from '../../core/admin-users.service';
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

/**
 * Le due operazioni sulle persone hanno conseguenze molto diverse — una blocca
 * l'accesso, l'altra cancella tutto ciò che una persona ha scritto — e prima
 * esisteva solo la seconda. Confonderle è il difetto che conta impedire.
 */
describe('Cittadini — togliere l\'accesso o eliminare', () => {
  const ATTIVO = {
    username: 'a1', email: 'attivo@esempio.it', nickname: 'Attivo',
    enabled: true, tipoUtente: 'residente',
  } as Citizen;

  let comp: Cittadini;
  let service: jasmine.SpyObj<AdminUsersService>;
  let dialogData: any;
  let rispondiSi: boolean;

  beforeEach(async () => {
    rispondiSi = true;
    dialogData = null;
    service = jasmine.createSpyObj<AdminUsersService>('AdminUsersService', [
      'getPending', 'getCitizens', 'approve', 'reject', 'revoke',
    ]);
    service.getPending.and.returnValue(of([]));
    service.getCitizens.and.returnValue(of([ATTIVO]));
    service.revoke.and.returnValue(of({ revoked: true, sessioniChiuse: true }));
    service.reject.and.returnValue(of(undefined as unknown as void));

    await TestBed.configureTestingModule({
      imports: [Cittadini],
      providers: [
        provideNoopAnimations(),
        { provide: AdminUsersService, useValue: service },
        {
          // Doppio del dialogo: cattura i dati con cui viene aperto, così si può
          // verificare COSA viene dichiarato all'utente prima di agire.
          provide: MatDialog,
          useValue: {
            open: (_c: unknown, cfg: any) => {
              dialogData = cfg?.data;
              return { afterClosed: () => of(rispondiSi) };
            },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Cittadini);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('«Rimuovi accesso» chiama revoke e NON la cancellazione', async () => {
    comp.revoke(ATTIVO);

    expect(service.revoke).toHaveBeenCalledWith('a1');
    expect(service.reject).not.toHaveBeenCalled();
  });

  it('dichiara che la disconnessione è immediata', async () => {
    // Il pulsante prometteva più di quanto faceva: il gate scatta solo al login,
    // quindi senza chiudere le sessioni chi era dentro restava dentro per giorni.
    // Ora che le chiude, il dialogo lo dice.
    comp.revoke(ATTIVO);

    expect(dialogData.messaggio).toMatch(/subito/i);
    expect(dialogData.messaggio).toMatch(/sta usando l'app/i);
  });

  it('avverte se la sessione aperta NON si è chiusa', async () => {
    // Credere di aver escluso qualcuno che invece continua a navigare è peggio
    // che vedere un errore.
    const snack = TestBed.inject(MatSnackBar);
    const spia = spyOn(snack, 'open');
    service.revoke.and.returnValue(of({ revoked: true, sessioniChiuse: false }));

    comp.revoke(ATTIVO);

    expect(spia).toHaveBeenCalled();
    expect(spia.calls.mostRecent().args[0] as string).toMatch(/potrebbe restare attiva/i);
  });

  it('dichiara che i contenuti restano, e che è reversibile', async () => {
    comp.revoke(ATTIVO);

    expect(dialogData.messaggio).toContain('RESTANO');
    expect(dialogData.messaggio).toMatch(/riabilitarla/i);
    // Nessuna parola da digitare: è un'azione reversibile, chiederla sarebbe
    // attrito senza motivo (e insegnerebbe a digitarla senza leggere).
    expect(dialogData.parolaChiave).toBeUndefined();
  });

  it('l\'eliminazione dichiara i dati che spariscono e pretende ELIMINA', async () => {
    // Da oggi «rifiuta» non cancella solo l'account: fa la pulizia vera. Con un
    // effetto più grande, la conferma digitata non è un vezzo.
    comp.reject(ATTIVO);

    expect(dialogData.parolaChiave).toBe('ELIMINA');
    for (const parola of ['proposte', 'foto', 'sostegni', 'segnalazioni']) {
      expect(dialogData.messaggio).withContext(parola).toContain(parola);
    }
    // E indirizza all'alternativa non distruttiva.
    expect(dialogData.messaggio).toContain('Rimuovi accesso');
    expect(service.reject).toHaveBeenCalledWith('a1');
  });

  it('se si annulla, non chiama niente', async () => {
    rispondiSi = false;

    comp.revoke(ATTIVO);
    comp.reject(ATTIVO);

    expect(service.revoke).not.toHaveBeenCalled();
    expect(service.reject).not.toHaveBeenCalled();
  });
});
