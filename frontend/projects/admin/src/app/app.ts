import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from 'shared';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatButtonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Il chrome (toolbar + tab) appare solo da loggati; sul login è a tutto schermo. */
  readonly user = this.auth.user;

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/accedi']);
  }
}
