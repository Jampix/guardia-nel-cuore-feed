import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { Category, Feedback, FeedbackStatus, FEEDBACK_STATUS_LABEL } from 'shared';
import { FeedbackService } from '../../core/feedback.service';

type View = 'lista' | 'mappa';
type Sort = 'recenti' | 'votati';

const PAGE = 12;

/** Bacheca pubblica: elenco a card dei feedback, con filtri, ricerca, ordinamento e paginazione. */
@Component({
  selector: 'app-bacheca',
  imports: [
    RouterLink, MatButtonToggleModule, MatChipsModule, MatCardModule,
    MatIconModule, MatFormFieldModule, MatInputModule, MatButtonModule,
  ],
  templateUrl: './bacheca.html',
  styleUrl: './bacheca.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Bacheca {
  private readonly service = inject(FeedbackService);

  readonly categories = toSignal(this.service.getCategories(), { initialValue: [] as Category[] });
  private readonly allFeedbacks = toSignal(this.service.getPublicFeedbacks(), { initialValue: [] as Feedback[] });

  readonly view = signal<View>('lista');
  readonly selectedCategory = signal<string | null>(null);
  readonly sort = signal<Sort>('recenti');
  readonly query = signal('');
  readonly visibleCount = signal(PAGE);

  /** Set completo filtrato (categoria + ricerca) e ordinato. */
  readonly filtered = computed(() => {
    const cat = this.selectedCategory();
    const q = this.query().trim().toLowerCase();
    let list = this.allFeedbacks();
    if (cat) list = list.filter((f) => f.categoriaId === cat);
    if (q) {
      list = list.filter((f) =>
        (f.titolo ?? '').toLowerCase().includes(q) ||
        (f.descrizione ?? '').toLowerCase().includes(q) ||
        (f.luogo ?? '').toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    if (this.sort() === 'votati') {
      sorted.sort((a, b) => (b.numeroVoti ?? 0) - (a.numeroVoti ?? 0));
    } else {
      sorted.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    }
    return sorted;
  });

  /** Porzione visibile (paginazione "carica altri"). */
  readonly visible = computed(() => this.filtered().slice(0, this.visibleCount()));
  readonly hasMore = computed(() => this.filtered().length > this.visible().length);

  readonly statusLabel = FEEDBACK_STATUS_LABEL;

  private readonly catNameById = computed(() => {
    const m = new Map<string, string>();
    for (const c of this.categories()) m.set(c.id, c.nome);
    return m;
  });

  constructor() {
    // Cambiando filtro/ricerca/ordinamento si riparte dalla prima pagina.
    effect(() => {
      this.selectedCategory(); this.query(); this.sort();
      this.visibleCount.set(PAGE);
    });
  }

  categoryName(id: string): string {
    return this.catNameById().get(id) ?? id;
  }

  statusClass(s: FeedbackStatus): string {
    return `st-${s}`;
  }

  categoryGradient(id: string): string {
    const map: Record<string, string> = {
      strade: 'linear-gradient(135deg, #9c6b4f, #6b4433)',
      verde: 'linear-gradient(135deg, #7c8a5a, #4d5a34)',
      illuminazione: 'linear-gradient(135deg, #c98a3c, #8a5a20)',
      rifiuti: 'linear-gradient(135deg, #5a8a7c, #345a4d)',
      sicurezza: 'linear-gradient(135deg, #8a6a9c, #5a3f6b)',
      cultura: 'linear-gradient(135deg, #b06a6a, #7a3f3f)',
    };
    return map[id] ?? 'linear-gradient(135deg, #9a8e88, #6e615b)';
  }

  setView(v: View): void { this.view.set(v); }
  selectCategory(id: string | null): void { this.selectedCategory.set(id); }
  loadMore(): void { this.visibleCount.update((n) => n + PAGE); }
}
