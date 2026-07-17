import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Category } from 'shared';
import { environment } from '../../environments/environment';

/** CRUD categorie per il backoffice. */
@Injectable({ providedIn: 'root' })
export class AdminCategoryService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Tutte le categorie, attive e non (staff). */
  getAll(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.api}/admin/categories`);
  }

  create(nome: string): Observable<Category> {
    return this.http.post<Category>(`${this.api}/admin/categories`, { nome });
  }

  update(id: string, patch: { nome?: string; attiva?: boolean }): Observable<Category> {
    return this.http.patch<Category>(`${this.api}/admin/categories/${id}`, patch);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/admin/categories/${id}`);
  }
}
