import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import * as L from 'leaflet';

// Centro di default: Guardia Piemontese (CS).
const DEFAULT_CENTER: L.LatLngExpression = [39.4667, 15.9];

// Segnalino disegnato inline (SVG) → nessuna dipendenza dalle immagini di Leaflet.
const PIN = L.divIcon({
  className: 'gnc-pin',
  html:
    '<svg width="32" height="32" viewBox="0 0 24 24" fill="#C0392B" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">' +
    '<path d="M12 2c-3.9 0-7 3-7 6.8 0 4.7 7 12.2 7 12.2s7-7.5 7-12.2C19 5 15.9 2 12 2z"/>' +
    '<circle cx="12" cy="8.6" r="2.4" fill="#fff"/></svg>',
  iconSize: [32, 32],
  iconAnchor: [16, 30],
});

/** Mappa Leaflet (OpenStreetMap). Editable = picker (clic/geolocalizzazione). */
@Component({
  selector: 'app-feedback-map',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './feedback-map.html',
  styleUrl: './feedback-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackMap implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  readonly lat = input<number>();
  readonly lng = input<number>();
  readonly editable = input(false);
  readonly pick = output<{ lat: number; lng: number }>();

  readonly locating = signal(false);
  /** Motivo del mancato rilevamento, mostrato all'utente (prima era muto). */
  readonly geoError = signal<string | null>(null);

  private map?: L.Map;
  private marker?: L.Marker;
  /** Ultimo punto scelto QUI dentro: serve a non ricentrare la mappa quando le
   *  coordinate rientrano dal padre come input (sarebbe uno scatto inutile). */
  private ultimoScelto?: { lat: number; lng: number };

  constructor() {
    // Le coordinate possono arrivare DOPO la creazione della mappa — per esempio
    // dalla ricerca di un indirizzo. Senza questo, il segnalino non si muoverebbe.
    effect(() => {
      const lat = this.lat();
      const lng = this.lng();
      if (!this.map || lat == null || lng == null) return;
      const suo = this.ultimoScelto;
      const stessoPunto = suo && Math.abs(suo.lat - lat) < 1e-9 && Math.abs(suo.lng - lng) < 1e-9;
      this.setMarker(lat, lng);
      if (!stessoPunto) this.map.setView([lat, lng], Math.max(this.map.getZoom(), 17));
    });
  }

  ngAfterViewInit(): void {
    const hasCoords = this.lat() != null && this.lng() != null;
    const center: L.LatLngExpression = hasCoords ? [this.lat()!, this.lng()!] : DEFAULT_CENTER;

    this.map = L.map(this.mapEl.nativeElement, {
      center,
      zoom: hasCoords ? 16 : 14,
      zoomControl: this.editable(),
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    if (hasCoords) this.setMarker(this.lat()!, this.lng()!);

    if (this.editable()) {
      this.map.on('click', (e: L.LeafletMouseEvent) => this.select(e.latlng.lat, e.latlng.lng));
    }

    // La mappa può nascere con dimensioni non ancora note: ricalcola dopo il render.
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  /**
   * Posizione attuale del dispositivo.
   *
   * Prima l'errore veniva scartato (`() => this.locating.set(false)`): quando
   * falliva, la rotellina si fermava e non accadeva nulla — l'utente non poteva
   * sapere se aveva negato il permesso, se la posizione non era disponibile o se
   * era scaduto il tempo, e nei log non restava traccia.
   *
   * Su Safari l'alta precisione passa da CoreLocation e su Mac senza GPS (o con
   * i Servizi di localizzazione disattivati per Safari) risponde spesso
   * "posizione non disponibile", mentre Chrome ricade sulla stima via WiFi. Per
   * questo, se il primo tentativo non riesce, si riprova SENZA alta precisione:
   * un punto approssimato è comunque meglio di nessun punto.
   */
  useMyLocation(): void {
    if (!navigator.geolocation) {
      this.geoError.set('Questo browser non è in grado di rilevare la posizione.');
      return;
    }
    this.geoError.set(null);
    this.locating.set(true);
    this.chiediPosizione(true);
  }

  private chiediPosizione(altaPrecisione: boolean): void {
    navigator.geolocation.getCurrentPosition(
      (pos) => this.accetta(pos),
      (err) => {
        // Permesso negato: riprovare non serve, l'esito sarebbe identico.
        if (err.code === err.PERMISSION_DENIED) {
          this.fallisci(err);
          return;
        }
        if (altaPrecisione) {
          console.warn('Posizione: ritento senza alta precisione', err.code, err.message);
          this.chiediPosizione(false);
          return;
        }
        // Ultima strada: `watchPosition`. Su Safari `getCurrentPosition` va in
        // timeout con una certa frequenza, mentre l'osservazione continua tiene
        // attivo il sottosistema di localizzazione e consegna il primo punto
        // appena disponibile. Si chiude subito dopo: non serve seguire l'utente.
        console.warn('Posizione: passo a watchPosition', err.code, err.message);
        this.osservaPosizione(err);
      },
      altaPrecisione
        ? { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        : { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  /** Terzo tentativo, con tetto di attesa gestito a mano. */
  private osservaPosizione(errorePrecedente: GeolocationPositionError): void {
    let chiuso = false;
    const stop = (id: number) => {
      if (chiuso) return;
      chiuso = true;
      navigator.geolocation.clearWatch(id);
    };
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        stop(id);
        this.accetta(pos);
      },
      (err) => {
        stop(id);
        this.fallisci(err);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
    // Alcuni browser non richiamano mai il callback d'errore su watchPosition:
    // senza questo tetto la rotellina girerebbe all'infinito.
    setTimeout(() => {
      if (chiuso) return;
      stop(id);
      this.fallisci(errorePrecedente);
    }, 12000);
  }

  private accetta(pos: GeolocationPosition): void {
    const { latitude, longitude } = pos.coords;
    this.map?.setView([latitude, longitude], 17);
    this.select(latitude, longitude);
    this.locating.set(false);
    this.geoError.set(null);
  }

  private fallisci(err: GeolocationPositionError): void {
    console.error('Posizione non ottenuta', err.code, err.message);
    this.locating.set(false);
    this.geoError.set(this.messaggioGeo(err));
  }

  /** Messaggio per ciascun motivo, con cosa può fare l'utente. */
  private messaggioGeo(err: GeolocationPositionError): string {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return 'Non ci hai dato accesso alla posizione. Puoi consentirlo dalle ' +
          'impostazioni del browser per questo sito, oppure toccare la mappa.';
      case err.POSITION_UNAVAILABLE:
        return 'La posizione non è disponibile. Su iPhone e Mac controlla che i ' +
          'servizi di localizzazione siano attivi per il browser; intanto puoi ' +
          'toccare la mappa.';
      case err.TIMEOUT:
        // Su Safari il timeout ha quasi sempre una di queste tre cause, e senza
        // dirle il messaggio non è utile: invitare a "riprovare" da solo porta
        // solo ad aspettare altri venti secondi per lo stesso esito.
        return 'Non è arrivata nessuna posizione. Su Mac serve il Wi-Fi acceso ' +
          '(anche se navighi via cavo) e i servizi di localizzazione attivi per ' +
          'il browser; su iPhone controlla che Safari possa usare la posizione. ' +
          'Puoi comunque toccare la mappa per indicare il punto.';
      default:
        return 'Non è stato possibile rilevare la posizione: tocca la mappa per ' +
          'indicare il punto.';
    }
  }

  private setMarker(lat: number, lng: number): void {
    if (this.marker) this.marker.setLatLng([lat, lng]);
    else if (this.map) this.marker = L.marker([lat, lng], { icon: PIN }).addTo(this.map);
  }

  private select(lat: number, lng: number): void {
    this.ultimoScelto = { lat, lng };
    this.setMarker(lat, lng);
    this.pick.emit({ lat, lng });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
