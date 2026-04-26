import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private toast = inject(ToastService);

  handleError(error: any): void {
    console.error('[GlobalErrorHandler]', error);
    const msg = error?.message || error?.toString() || 'An unexpected error occurred.';
    // Ignore known non-critical Angular/chunk errors
    if (msg.includes('ChunkLoadError') || msg.includes('Loading chunk')) {
      this.toast.show('App updated — please refresh the page.', 'info', 8000);
      return;
    }
    this.toast.show('Something went wrong. Please try again.', 'error', 5000);
  }
}
