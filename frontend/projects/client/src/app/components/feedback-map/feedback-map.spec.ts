import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { FeedbackMap } from './feedback-map';

/**
 * Geolocalizzazione del picker.
 *
 * Prima l'errore veniva scartato: quando falliva, la rotellina si fermava e non
 * accadeva nulla — l'utente non sapeva perché e nei log non restava traccia. È
 * il difetto che ha fatto dire "su Safari non prende la posizione" senza che si
 * potesse capire il motivo.
 */
describe('FeedbackMap — posizione attuale', () => {
  let fixture: ComponentFixture<FeedbackMap>;
  let comp: FeedbackMap;
  /** Chiamate ricevute da getCurrentPosition, con le opzioni usate. */
  let chiamate: { opts: PositionOptions; ok: PositionCallback; ko: PositionErrorCallback }[];

  const ERR = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
  const errore = (code: number) => ({ ...ERR, code, message: 'test' }) as GeolocationPositionError;

  beforeEach(async () => {
    chiamate = [];
    spyOnProperty(navigator, 'geolocation', 'get').and.returnValue({
      getCurrentPosition: (ok: any, ko: any, opts: any) => chiamate.push({ opts, ok, ko }),
      watchPosition: () => 0,
      clearWatch: () => {},
    } as any);

    await TestBed.configureTestingModule({
      imports: [FeedbackMap],
      providers: [provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedbackMap);
    comp = fixture.componentInstance;
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
  });

  it('al successo emette il punto e smette di cercare', () => {
    let scelto: { lat: number; lng: number } | undefined;
    comp.pick.subscribe((p) => (scelto = p));

    comp.useMyLocation();
    expect(comp.locating()).toBeTrue();
    chiamate[0].ok({ coords: { latitude: 39.46, longitude: 15.98 } } as any);

    expect(scelto).toEqual({ lat: 39.46, lng: 15.98 });
    expect(comp.locating()).toBeFalse();
    expect(comp.geoError()).toBeNull();
  });

  it('se l\'alta precisione non riesce, RIPROVA senza', () => {
    // È il rimedio per Safari: l'alta precisione passa da CoreLocation e su Mac
    // senza GPS risponde spesso "posizione non disponibile", mentre la stima via
    // WiFi funziona. Un punto approssimato è meglio di nessun punto.
    comp.useMyLocation();
    expect(chiamate[0].opts.enableHighAccuracy).toBeTrue();

    chiamate[0].ko(errore(ERR.POSITION_UNAVAILABLE));

    expect(chiamate.length).toBe(2);
    expect(chiamate[1].opts.enableHighAccuracy).toBeFalse();
    // Sta ancora cercando: nessun messaggio d'errore prematuro.
    expect(comp.locating()).toBeTrue();
    expect(comp.geoError()).toBeNull();
  });

  it('il secondo tentativo può riuscire', () => {
    let scelto: any;
    comp.pick.subscribe((p) => (scelto = p));

    comp.useMyLocation();
    chiamate[0].ko(errore(ERR.TIMEOUT));
    chiamate[1].ok({ coords: { latitude: 39.4, longitude: 15.9 } } as any);

    expect(scelto).toEqual({ lat: 39.4, lng: 15.9 });
    expect(comp.geoError()).toBeNull();
  });

  it('col permesso NEGATO non riprova: l\'esito sarebbe identico', () => {
    comp.useMyLocation();
    chiamate[0].ko(errore(ERR.PERMISSION_DENIED));

    expect(chiamate.length).toBe(1);
    expect(comp.locating()).toBeFalse();
    expect(comp.geoError()).toContain('accesso alla posizione');
  });

  it('spiega ciascun motivo in modo diverso, e dice cosa fare', () => {
    const messaggi = new Map<number, string>();
    for (const code of [ERR.POSITION_UNAVAILABLE, ERR.TIMEOUT]) {
      comp.useMyLocation();
      const n = chiamate.length;
      chiamate[n - 1].ko(errore(code)); // primo tentativo
      chiamate[chiamate.length - 1].ko(errore(code)); // ritento
      messaggi.set(code, comp.geoError() ?? '');
    }

    expect(messaggi.get(ERR.POSITION_UNAVAILABLE)).toContain('servizi di localizzazione');
    expect(messaggi.get(ERR.TIMEOUT)).toContain('troppo tempo');
    // Ogni messaggio offre l'alternativa: la mappa si può sempre toccare.
    for (const m of messaggi.values()) expect(m).toContain('mappa');
    // E i due motivi non danno lo stesso testo.
    expect(messaggi.get(ERR.POSITION_UNAVAILABLE)).not.toBe(messaggi.get(ERR.TIMEOUT));
  });

  it('accetta una posizione recente invece di pretenderne una nuova', () => {
    // Senza `maximumAge` ogni richiesta forza una rilevazione da zero, che su
    // Safari è proprio il caso che fallisce.
    comp.useMyLocation();
    expect(chiamate[0].opts.maximumAge).toBeGreaterThan(0);
    expect(chiamate[0].opts.timeout).toBeGreaterThanOrEqual(15000);
  });
});
