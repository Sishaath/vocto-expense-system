import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-notif-bell',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './notif-bell.component.html',
  styleUrl: './notif-bell.component.scss'
})
export class NotifBellComponent implements OnInit, OnChanges, OnDestroy {
  @Input() userEmail = '';

  open = false;
  notifications: any[] = [];
  private pollTimer: any;
  private channel: any;

  constructor(private supabase: SupabaseService, private router: Router) {}

  async ngOnInit() {
    // Load own session directly — don't wait for parent binding
    const { data } = await this.supabase.getClient().auth.getSession();
    if (data.session?.user?.email) {
      this.userEmail = data.session.user.email;
    }
    if (!this.userEmail) return;
    await this.load();
    // Realtime: new notification arrives instantly
    this.channel = this.supabase.getClient()
      .channel('notif-' + this.userEmail)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_email=eq.${this.userEmail}`
      }, () => this.load())
      .subscribe();
    // Fallback poll every 20s
    this.pollTimer = setInterval(() => this.load(), 20000);
  }

  ngOnChanges(changes: SimpleChanges) {}

  ngOnDestroy() {
    clearInterval(this.pollTimer);
    if (this.channel) this.supabase.getClient().removeChannel(this.channel);
  }

  async load() {
    const { data } = await this.supabase.getMyNotifications(this.userEmail);
    if (data) this.notifications = data;
  }

  get unreadCount() { return this.notifications.filter(n => !n.read).length; }

  toggle() { this.open = !this.open; }
  close() { this.open = false; }

  async clickNotif(n: any) {
    if (!n.read) await this.supabase.markNotificationRead(n.id);
    n.read = true;
    this.open = false;
    if (n.entity_type === 'claim') {
      // Navigate to the right dashboard with the claim ref highlighted
      const route = ['rrk@voctotechnologies.com', 'md@voctotechnologies.com'].includes(this.userEmail) ? '/md' : '/accounts';
      this.router.navigate([route], { queryParams: { open: n.entity_ref || n.entity_id } });
    } else if (n.entity_type === 'purchase_order') {
      this.router.navigate(['/po/view', n.entity_id]);
    }
  }

  async markAllRead() {
    const unread = this.notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => this.supabase.markNotificationRead(n.id)));
    this.notifications = this.notifications.map(n => ({ ...n, read: true }));
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
}
