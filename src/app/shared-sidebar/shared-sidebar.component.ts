import { Component, Input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-shared-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './shared-sidebar.component.html',
  styleUrls: ['./shared-sidebar.component.scss']
})
export class SharedSidebarComponent {
  @Input() activeView: 'claims' | 'pos' = 'claims';
  @Input() activeStatus: string = 'all';

  constructor(private router: Router) {}

  is(path: string): boolean {
    return this.router.url.startsWith(path);
  }
}
