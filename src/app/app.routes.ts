import { Routes } from '@angular/router';
import { roleGuard } from './services/role.guard';

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
    path: 'comercio',
    canActivate: [roleGuard('comercio')],
    loadComponent: () => import('./pages/comercio/comercio.page').then((m) => m.ComercioPage),
  },
  {
    path: 'tabs',
    canActivate: [roleGuard('cliente')],
    loadComponent: () => import('./pages/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'home', loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage) },
      { path: 'buscar', redirectTo: 'home', pathMatch: 'full' },
      { path: 'explorar', loadComponent: () => import('./pages/explorar/explorar.page').then((m) => m.ExplorarPage) },
      { path: 'explorar/:id', loadComponent: () => import('./pages/tienda/tienda.page').then((m) => m.TiendaPage) },
      { path: 'qr', loadComponent: () => import('./pages/qr/qr.page').then((m) => m.QrPage) },
      { path: 'puntos', loadComponent: () => import('./pages/puntos/puntos.page').then((m) => m.PuntosPage) },
      { path: 'perfil', loadComponent: () => import('./pages/perfil/perfil.page').then((m) => m.PerfilPage) },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
