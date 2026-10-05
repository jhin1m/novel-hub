import { createRouter } from '@tanstack/react-router';
import { ErrorPage, NotFoundPage } from './components/not-found';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: ErrorPage,
    defaultStaleTime: 30_000,
    defaultPreloadStaleTime: 30_000,
  });
}
