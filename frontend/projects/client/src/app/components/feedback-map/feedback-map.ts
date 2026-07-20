import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
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

  private map?: L.Map;
  private marker?: L.Marker;

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

  useMyLocation(): void {
    if (!navigator.geolocation) return;
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        this.map?.setView([latitude, longitude], 17);
        this.select(latitude, longitude);
        this.locating.set(false);
      },
      () => this.locating.set(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  private setMarker(lat: number, lng: number): void {
    if (this.marker) this.marker.setLatLng([lat, lng]);
    else if (this.map) this.marker = L.marker([lat, lng], { icon: PIN }).addTo(this.map);
  }

  private select(lat: number, lng: number): void {
    this.setMarker(lat, lng);
    this.pick.emit({ lat, lng });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
