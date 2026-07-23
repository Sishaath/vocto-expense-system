import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NotifBellComponent } from '../../notif-bell/notif-bell.component';
import { RailModule } from '../nav-config';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, NotifBellComponent],
  templateUrl: './app-shell.component.html',
  styleUrls: ['./app-shell.component.scss']
})
export class AppShellComponent {
  @Input() modules: RailModule[] = [];
  @Input() activeModule = '';
  @Input() pageTitle = '';
  @Input() pageSubtitle = '';
  @Input() userEmail = '';
  @Input() userName = '';
  @Input() hasSubnav = false;
  @Output() logoutClick = new EventEmitter<void>();

  mobileNavOpen = false;

  constructor(public router: Router) {}

  get userInitial(): string {
    return (this.userName || this.userEmail).charAt(0).toUpperCase() || 'V';
  }

  toggleMobileNav() { this.mobileNavOpen = !this.mobileNavOpen; }
  closeMobileNav() { this.mobileNavOpen = false; }
}
