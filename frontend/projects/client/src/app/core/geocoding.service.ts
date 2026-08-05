import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of } from 'rxjs';

/** Punto trovato a partire da un indirizzo. */
export interface Luogo {
  lat: number;
  lng: number;
  /** Indirizzo normalizzato come lo restituisce OpenStreetMap. */
  indirizzo: string;
}

/** Riquadro attorno a Guardia Piemontese: ovest, nord, est, sud. */
const AREA = '15.80,39.55,16.05,39.38';

/**
 * Conversione fra indirizzo e coordinate, in entrambi i sensi, con Nominatim
 * (il servizio di OpenStreetMap).
 *
 * Perché Nominatim: gratuito, nessuna chiave, nessuna infrastruttura da
 * aggiungere e stessi dati della mappa che l'app già mostra.
 *
 * ⚠️ La sua politica d'uso vieta le chiamate a ogni tasto premuto: le ricerche
 * partono SOLO da un'azione esplicita dell'utente, mai mentre scrive. È un
 * servizio offerto per cortesia: ai volumi di un paese va bene, se cresceranno
 * va sostituito (o messo dietro una nostra Lambda che faccia da tramite e
 * memorizzi i risultati).
 *
 * Gli errori non vengono propagati: un geocodificatore che non risponde non
 * deve impedire di inviare una proposta. L'indirizzo scritto a mano resta valido
 * comunque — "davanti al bar della piazza" non lo trova nessun servizio, ma per
 * l'associazione è più chiaro di due coordinate.
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly http = inject(HttpClient);
  private readonly base = 'https://nominatim.openstreetmap.org';

  /** Indirizzo → punto. `null` se non si trova nulla o il servizio non risponde. */
  cercaIndirizzo(indirizzo: string): Observable<Luogo | null> {
    const q = indirizzo.trim();
    if (!q) return of(null);
    const url =
      `${this.base}/search?format=jsonv2&limit=1&countrycodes=it` +
      // `viewbox` + `bounded=0`: i risultati dell'area del paese vengono prima,
      // ma una via di un comune vicino resta trovabile.
      `&viewbox=${AREA}&bounded=0&accept-language=it&q=${encodeURIComponent(q)}`;

    return this.http.get<any[]>(url).pipe(
      map((r) =>
        r?.length
          ? { lat: Number(r[0].lat), lng: Number(r[0].lon), indirizzo: String(r[0].display_name) }
          : null,
      ),
      catchError((e) => {
        console.warn('Ricerca indirizzo non riuscita', e?.status ?? e);
        return of(null);
      }),
    );
  }

  /**
   * Punto → indirizzo leggibile. Serve quando il cittadino tocca la mappa: senza
   * questo l'associazione riceve due numeri e nessuna parola, e chi legge nel
   * backoffice deve aprire una mappa per capire dove sia.
   */
  cercaIndirizzoDaPunto(lat: number, lng: number): Observable<string | null> {
    const url =
      `${this.base}/reverse?format=jsonv2&zoom=18&accept-language=it` +
      `&lat=${lat}&lon=${lng}`;

    return this.http.get<any>(url).pipe(
      map((r) => (r?.address ? this.componiIndirizzo(r.address) : r?.display_name ?? null)),
      catchError((e) => {
        console.warn('Indirizzo dal punto non trovato', e?.status ?? e);
        return of(null);
      }),
    );
  }

  /**
   * Indirizzo breve e leggibile. `display_name` di Nominatim arriva fino alla
   * nazione e al codice postale: in un campo di form è illeggibile.
   */
  private componiIndirizzo(a: Record<string, string>): string {
    const via = a['road'] ?? a['pedestrian'] ?? a['footway'] ?? a['hamlet'] ?? '';
    const civico = a['house_number'] ?? '';
    const zona = a['suburb'] ?? a['village'] ?? a['town'] ?? a['city'] ?? '';
    const parti = [[via, civico].filter(Boolean).join(' '), zona].filter(Boolean);
    return parti.join(', ') || (a['county'] ?? '');
  }
}
