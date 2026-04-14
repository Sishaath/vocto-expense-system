import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ToastComponent } from './shared/toast.component';
import { SupabaseService } from './supabase.service';

const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'vocto-expense-system';
  private inactivityTimer: any;

  constructor(private supabase: SupabaseService, private router: Router) {}

  ngOnInit() { this.resetTimer(); }
  ngOnDestroy() { clearTimeout(this.inactivityTimer); }

  @HostListener('document:mousemove')
  @HostListener('document:keydown')
  @HostListener('document:click')
  @HostListener('document:touchstart')
  onActivity() { this.resetTimer(); }

  private resetTimer() {
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(async () => {
      const { data } = await this.supabase.getClient().auth.getSession();
      if (data.session) {
        await this.supabase.signOut();
        this.router.navigate(['/login'], { queryParams: { reason: 'timeout' } });
      }
    }, INACTIVITY_MS);
  }
}
