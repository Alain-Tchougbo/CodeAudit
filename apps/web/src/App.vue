<template>
  <header class="border-b border-slate-200 bg-white">
    <nav
      class="mx-auto flex max-w-4xl items-center justify-between px-6 py-5"
      aria-label="Navigation principale"
    >
      <RouterLink
        to="/projects"
        class="text-xl font-bold"
      >CodeAudit</RouterLink>
      <RouterLink
        to="/projects"
        class="underline"
      >Projets</RouterLink>
    </nav>
  </header>
  <main class="mx-auto max-w-4xl px-6 py-10">
    <RouterView />
  </main>
</template>
