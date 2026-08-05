import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { GeocodingService } from './geocoding.service';

/**
 * Conversione indirizzo ↔ coordinate con Nominatim. Due cose contano: che il
 * servizio non risponda non deve impedire di inviare una proposta, e
 * l'indirizzo mostrato all'utente deve essere breve — `display_name` di
 * Nominatim arriva fino alla nazione e in un campo di form è illeggibile.
 */
describe('GeocodingService', () => {
  let geo: GeocodingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), GeocodingService],
    });
    geo = TestBed.inject(GeocodingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('indirizzo → punto', () => {
    it('restituisce il primo risultato', () => {
      let esito: any;
      geo.cercaIndirizzo('Via Roma').subscribe((r) => (esito = r));

      const req = http.expectOne((r) => r.url.includes('/search'));
      req.flush([{ lat: '39.46', lon: '15.98', display_name: 'Via Roma, Guardia Piemontese' }]);

      expect(esito).toEqual({ lat: 39.46, lng: 15.98, indirizzo: 'Via Roma, Guardia Piemontese' });
    });

    it('cerca in Italia e dà priorità all\'area del paese, senza escludere il resto', () => {
      geo.cercaIndirizzo('Via Roma').subscribe();

      const req = http.expectOne((r) => r.url.includes('/search'));
      expect(req.request.url).toContain('countrycodes=it');
      expect(req.request.url).toContain('viewbox=');
      // `bounded=0`: una via di un comune vicino resta trovabile.
      expect(req.request.url).toContain('bounded=0');
    });

    it('null se non trova nulla', () => {
      let esito: any = 'non impostato';
      geo.cercaIndirizzo('qualcosa di inesistente').subscribe((r) => (esito = r));

      http.expectOne((r) => r.url.includes('/search')).flush([]);

      expect(esito).toBeNull();
    });

    it('null (non un errore) se il servizio non risponde', () => {
      // Un geocodificatore giù non deve impedire di inviare la proposta.
      let esito: any = 'non impostato';
      let erroreRicevuto = false;
      geo.cercaIndirizzo('Via Roma').subscribe({
        next: (r) => (esito = r),
        error: () => (erroreRicevuto = true),
      });

      http.expectOne((r) => r.url.includes('/search'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });

      expect(esito).toBeNull();
      expect(erroreRicevuto).toBeFalse();
    });

    it('non chiama il servizio per una stringa vuota', () => {
      let esito: any = 'non impostato';
      geo.cercaIndirizzo('   ').subscribe((r) => (esito = r));

      http.expectNone((r) => r.url.includes('/search'));
      expect(esito).toBeNull();
    });
  });

  describe('punto → indirizzo', () => {
    it('compone un indirizzo breve: via, civico e zona', () => {
      let esito: any;
      geo.cercaIndirizzoDaPunto(39.46, 15.98).subscribe((r) => (esito = r));

      http.expectOne((r) => r.url.includes('/reverse')).flush({
        display_name: 'Via Roma, 12, Guardia Marina, Guardia Piemontese, Cosenza, Calabria, 87020, Italia',
        address: {
          road: 'Via Roma',
          house_number: '12',
          suburb: 'Guardia Marina',
          county: 'Cosenza',
          country: 'Italia',
          postcode: '87020',
        },
      });

      // Non il display_name intero: in un campo di form sarebbe illeggibile.
      expect(esito).toBe('Via Roma 12, Guardia Marina');
      expect(esito).not.toContain('Italia');
      expect(esito).not.toContain('87020');
    });

    it('regge l\'assenza del civico', () => {
      let esito: any;
      geo.cercaIndirizzoDaPunto(39.46, 15.98).subscribe((r) => (esito = r));

      http.expectOne((r) => r.url.includes('/reverse')).flush({
        address: { road: 'Via Toscana', suburb: 'Guardia Marina' },
      });

      expect(esito).toBe('Via Toscana, Guardia Marina');
    });

    it('in aperta campagna usa quello che c\'è', () => {
      let esito: any;
      geo.cercaIndirizzoDaPunto(39.46, 15.98).subscribe((r) => (esito = r));

      http.expectOne((r) => r.url.includes('/reverse')).flush({
        address: { county: 'Cosenza' },
      });

      expect(esito).toBe('Cosenza');
    });

    it('null se il servizio non risponde', () => {
      let esito: any = 'non impostato';
      geo.cercaIndirizzoDaPunto(39.46, 15.98).subscribe((r) => (esito = r));

      http.expectOne((r) => r.url.includes('/reverse'))
        .flush('boom', { status: 500, statusText: 'Server Error' });

      expect(esito).toBeNull();
    });
  });
});
