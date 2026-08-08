import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from 'shared';

import { authInterceptor } from './auth.interceptor';
import { environment } from '../../environments/environment';
import { environment as environmentDev } from '../../environments/environment.development';

/**
 * L'interceptor allega il JWT alle richieste che iniziano con `environment.apiUrl`.
 * La regola è semplice ma ha un bordo tagliente: **il token non deve uscire
 * verso terzi**. L'app parla anche con S3 (PUT prefirmato della foto) e con il
 * geocodificatore di OpenStreetMap, e mandare loro un token di sessione
 * significherebbe consegnare l'identità di un cittadino a un servizio esterno —
 * senza nessun errore che lo segnali.
 */
describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getIdToken: () => Promise.resolve('token-finto') } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function autorizzazione(url: string): Promise<string | null> {
    return new Promise((res) => {
      http.get(url).subscribe({ next: () => {}, error: () => {} });
      // L'interceptor risolve una Promise (getIdToken) prima di inoltrare:
      // serve un giro di microtask prima che la richiesta sia visibile.
      setTimeout(() => {
        const req = httpMock.expectOne(url);
        res(req.request.headers.get('Authorization'));
        req.flush({});
      }, 0);
    });
  }

  it('allega il token alle chiamate verso la nostra API', async () => {
    expect(await autorizzazione(`${environment.apiUrl}/feedback/public`)).toBe('Bearer token-finto');
  });

  it('NON allega il token al PUT prefirmato su S3', async () => {
    const s3 = 'https://gncprod-photos.s3.eu-west-1.amazonaws.com/feedback/x.jpg?X-Amz-Signature=abc';
    expect(await autorizzazione(s3)).toBeNull();
  });

  it('NON allega il token al geocodificatore di OpenStreetMap', async () => {
    expect(await autorizzazione('https://nominatim.openstreetmap.org/search?q=via+roma')).toBeNull();
  });

  it('nessun ambiente usa un apiUrl vuoto', () => {
    // È la trappola dello sviluppo locale: con `apiUrl: ''` **ogni** URL inizia
    // con apiUrl, quindi la regola dell'interceptor collassa e il token
    // finirebbe su S3 e su OpenStreetMap. Il proxy del dev server usa `/api`
    // proprio per evitarlo.
    for (const [nome, env] of [['produzione', environment], ['sviluppo', environmentDev]] as const) {
      expect(env.apiUrl).withContext(`apiUrl di ${nome}`).toBeTruthy();
      expect(env.apiUrl.length).withContext(`apiUrl di ${nome}`).toBeGreaterThan(1);
    }
  });
});
