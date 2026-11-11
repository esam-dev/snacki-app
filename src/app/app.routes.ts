import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'tabs',
    loadComponent: () => import('./pages/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'buscar', loadComponent: () => import('./pages/buscar/buscar.page').then((m) => m.BuscarPage) },
      { path: 'explorar', loadComponent: () => import('./pages/explorar/explorar.page').then((m) => m.ExplorarPage) },
      { path: 'explorar/:id', loadComponent: () => import('./pages/tienda/tienda.page').then((m) => m.TiendaPage) },
      { path: 'qr', loadComponent: () => import('./pages/qr/qr.page').then((m) => m.QrPage) },
      { path: 'puntos', loadComponent: () => import('./pages/puntos/puntos.page').then((m) => m.PuntosPage) },
      { path: 'perfil', loadComponent: () => import('./pages/perfil/perfil.page').then((m) => m.PerfilPage) },
      { path: '', redirectTo: 'explorar', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
