import { Component, Input, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-shared-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './shared-sidebar.component.html',
  styleUrls: ['./shared-sidebar.component.scss']
})
export class SharedSidebarComponent implements OnInit {
  @Input() activeView: 'claims' | 'pos' = 'claims';
  @Input() activeStatus: string = 'all';
  isAdmin = false;

  constructor(private router: Router, private supabase: SupabaseService) {}

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (session?.user?.email) {
      const role = await this.supabase.getUserRole(session.user.email);
      this.isAdmin = role === 'admin';
    }
  }

  is(path: string): boolean {
    return this.router.url.startsWith(path);
  }
}
