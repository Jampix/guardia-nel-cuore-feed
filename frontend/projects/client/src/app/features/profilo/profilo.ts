import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';

/** Profilo del cittadino: dati account + logout. */
@Component({
  selector: 'app-profilo',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './profilo.html',
  styleUrl: './profilo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profilo {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/']);
  }
}
