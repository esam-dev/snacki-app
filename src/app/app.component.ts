import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { NavigationEnd, Router } from '@angular/router';
import { filter, take } from 'rxjs';

@Component({
  selector: 'app-root',
  template: `<ion-app><ion-router-outlet></ion-router-outlet></ion-app>`,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private router = inject(Router);

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        take(1),
      )
      .subscribe(() => {
        const splash = document.getElementById('app-loading');
        if (!splash) return;

        splash.classList.add('is-hiding');
        window.setTimeout(() => splash.remove(), 300);
      });
  }
}
