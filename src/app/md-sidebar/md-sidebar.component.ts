import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-md-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './md-sidebar.component.html',
  styleUrls: ['./md-sidebar.component.scss']
})
export class MdSidebarComponent {
  @Input() activeSection: string = 'all';
  @Input() pendingReqCount: number = 0;
  @Output() sectionChange = new EventEmitter<string>();

  constructor(private router: Router) {}

  go(section: string) { this.sectionChange.emit(section); }
  is(path: string): boolean { return this.router.url.startsWith(path); }
}
