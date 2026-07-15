import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Category, Feedback, FeedbackStatus, FEEDBACK_STATUS_LABEL } from 'shared';
import { FeedbackService } from '../../core/feedback.service';

type View = 'lista' | 'mappa';

/** Bacheca pubblica: elenco a card dei feedback dei cittadini, con filtri. */
@Component({
  selector: 'app-bacheca',
  imports: [RouterLink, MatButtonToggleModule, MatChipsModule, MatCardModule, MatIconModule],
  templateUrl: './bacheca.html',
  styleUrl: './bacheca.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Bacheca {
  private readonly service = inject(FeedbackService);

  readonly categories = toSignal(this.service.getCategories(), { initialValue: [] as Category[] });
  private readonly allFeedbacks = toSignal(this.service.getPublicFeedbacks(), { initialValue: [] as Feedback[] });

  readonly view = signal<View>('lista');
  /** id categoria selezionata; null = "Tutte". */
  readonly selectedCategory = signal<string | null>(null);

  /** Feedback filtrati per la categoria attiva. */
  readonly feedbacks = computed(() => {
    const cat = this.selectedCategory();
    const all = this.allFeedbacks();
    return cat ? all.filter((f) => f.categoriaId === cat) : all;
  });

  readonly statusLabel = FEEDBACK_STATUS_LABEL;

  private readonly catNameById = computed(() => {
    const m = new Map<string, string>();
    for (const c of this.categories()) m.set(c.id, c.nome);
    return m;
  });

  categoryName(id: string): string {
    return this.catNameById().get(id) ?? id;
  }

  /** Classe CSS del chip di stato (colori semantici). */
  statusClass(s: FeedbackStatus): string {
    return `st-${s}`;
  }

  /** Gradiente della miniatura per categoria (placeholder finché non c'è foto). */
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

  setView(v: View): void {
    this.view.set(v);
  }

  selectCategory(id: string | null): void {
    this.selectedCategory.set(id);
  }
}
