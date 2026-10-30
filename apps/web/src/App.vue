<template>
  <a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-white focus:p-4"
  >Aller au contenu</a>
  <header class="border-b border-slate-200 bg-white">
    <nav
      class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6"
      aria-label="Navigation principale"
    >
      <RouterLink
        to="/"
        class="text-xl font-bold tracking-tight text-indigo-950"
      >CodeAudit</RouterLink>
      <div class="flex gap-2 text-sm font-medium">
        <RouterLink
          to="/"
          exact-active-class="bg-indigo-50 text-indigo-800"
          class="rounded-lg px-3 py-2"
        >Tableau de bord</RouterLink>
        <RouterLink
          to="/projects"
          active-class="bg-indigo-50 text-indigo-800"
          class="rounded-lg px-3 py-2"
        >Projets</RouterLink>
      </div>
    </nav>
  </header>
  <main
    id="main-content"
    class="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10"
  >
    <RouterView />
  </main>
</template>
